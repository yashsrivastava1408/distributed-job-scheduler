import prisma from '../../shared/db';
import { NotFoundError, QueuePausedError } from '../../shared/errors';
import { socketService } from './socket.service';

export class QueueService {
  /** List queues for a project, with job counts */
  async listForProject(projectId: string) {
    const queues = await prisma.queue.findMany({
      where: { projectId },
      include: {
        defaultRetryPolicy: true,
        _count: { select: { jobs: true } },
      },
      orderBy: { priority: 'desc' },
    });

    // Enrich with status breakdowns
    const enriched = await Promise.all(
      queues.map(async (queue) => {
        const statusCounts = await this.getStatusCounts(queue.id);
        return {
          ...queue,
          jobCount: queue._count.jobs,
          ...statusCounts,
        };
      })
    );

    return enriched;
  }

  /** Create a queue with optional retry policy */
  async create(
    projectId: string,
    data: {
      name: string;
      priority?: number;
      maxConcurrency?: number;
      retryPolicy?: {
        strategy: string;
        baseDelayMs: number;
        maxDelayMs: number;
        maxAttempts: number;
        jitter?: boolean;
      };
    }
  ) {
    return prisma.$transaction(async (tx) => {
      let retryPolicyId: string | undefined;

      if (data.retryPolicy) {
        const policy = await tx.retryPolicy.create({
          data: {
            strategy: data.retryPolicy.strategy as any,
            baseDelayMs: data.retryPolicy.baseDelayMs,
            maxDelayMs: data.retryPolicy.maxDelayMs,
            maxAttempts: data.retryPolicy.maxAttempts,
            jitter: data.retryPolicy.jitter ?? false,
          },
        });
        retryPolicyId = policy.id;
      }

      const queue = await tx.queue.create({
        data: {
          projectId,
          name: data.name,
          priority: data.priority ?? 0,
          maxConcurrency: data.maxConcurrency ?? 10,
          defaultRetryPolicyId: retryPolicyId,
        },
        include: { defaultRetryPolicy: true },
      });

      socketService.broadcastToProject(projectId, 'queue:updated', queue);
      return queue;
    });
  }

  /** Get queue by ID */
  async getById(id: string) {
    const queue = await prisma.queue.findUnique({
      where: { id },
      include: {
        defaultRetryPolicy: true,
        _count: { select: { jobs: true, scheduledJobs: true } },
      },
    });
    if (!queue) throw new NotFoundError('Queue', id);

    const statusCounts = await this.getStatusCounts(id);
    return { ...queue, ...statusCounts };
  }

  /** Update queue configuration */
  async update(
    id: string,
    data: { name?: string; priority?: number; maxConcurrency?: number }
  ) {
    const queue = await prisma.queue.findUnique({ where: { id } });
    if (!queue) throw new NotFoundError('Queue', id);

    const updated = await prisma.queue.update({
      where: { id },
      data,
      include: { defaultRetryPolicy: true },
    });
    socketService.broadcastToProject(updated.projectId, 'queue:updated', updated);
    return updated;
  }

  /** Delete a queue (cascades to all jobs) */
  async delete(id: string) {
    const queue = await prisma.queue.findUnique({ where: { id } });
    if (!queue) throw new NotFoundError('Queue', id);
    await prisma.queue.delete({ where: { id } });
    socketService.broadcastToProject(queue.projectId, 'queue:deleted', { id, name: queue.name });
  }

  /** Pause a queue — no new jobs will be claimed */
  async pause(id: string) {
    const queue = await prisma.queue.findUnique({ where: { id } });
    if (!queue) throw new NotFoundError('Queue', id);

    const updated = await prisma.queue.update({
      where: { id },
      data: { isPaused: true },
      include: { defaultRetryPolicy: true },
    });
    socketService.broadcastToProject(updated.projectId, 'queue:updated', updated);
    return updated;
  }

  /** Resume a paused queue */
  async resume(id: string) {
    const queue = await prisma.queue.findUnique({ where: { id } });
    if (!queue) throw new NotFoundError('Queue', id);

    const updated = await prisma.queue.update({
      where: { id },
      data: { isPaused: false },
      include: { defaultRetryPolicy: true },
    });
    socketService.broadcastToProject(updated.projectId, 'queue:updated', updated);
    return updated;
  }

  /** Get queue stats for the dashboard */
  async getStats(id: string) {
    const queue = await prisma.queue.findUnique({ where: { id } });
    if (!queue) throw new NotFoundError('Queue', id);

    const statusCounts = await this.getStatusCounts(id);

    // Throughput: completed jobs in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const throughputLastHour = await prisma.job.count({
      where: {
        queueId: id,
        status: 'completed',
        completedAt: { gte: oneHourAgo },
      },
    });

    // Average duration of completed jobs (last 100)
    const recentExecutions = await prisma.jobExecution.findMany({
      where: {
        job: { queueId: id },
        status: 'succeeded',
        durationMs: { not: null },
      },
      select: { durationMs: true },
      orderBy: { finishedAt: 'desc' },
      take: 100,
    });

    const avgDurationMs =
      recentExecutions.length > 0
        ? Math.round(
            recentExecutions.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) /
              recentExecutions.length
          )
        : 0;

    return {
      queueId: id,
      isPaused: queue.isPaused,
      maxConcurrency: queue.maxConcurrency,
      ...statusCounts,
      throughputLastHour,
      avgDurationMs,
    };
  }

  /** Verify queue exists and is not paused (used before job submission) */
  async assertAcceptingJobs(id: string) {
    const queue = await prisma.queue.findUnique({ where: { id } });
    if (!queue) throw new NotFoundError('Queue', id);
    if (queue.isPaused) throw new QueuePausedError(id);
    return queue;
  }

  // ─── Private helpers ────────────────────────────────────────────

  private async getStatusCounts(queueId: string) {
    const [queued, claimed, running, completed, failed, deadLetter, cancelled] =
      await Promise.all([
        prisma.job.count({ where: { queueId, status: 'queued' } }),
        prisma.job.count({ where: { queueId, status: 'claimed' } }),
        prisma.job.count({ where: { queueId, status: 'running' } }),
        prisma.job.count({ where: { queueId, status: 'completed' } }),
        prisma.job.count({ where: { queueId, status: 'failed' } }),
        prisma.job.count({ where: { queueId, status: 'dead_letter' } }),
        prisma.job.count({ where: { queueId, status: 'cancelled' } }),
      ]);

    return {
      statusCounts: { queued, claimed, running, completed, failed, deadLetter, cancelled },
      backlogSize: queued + claimed,
      activeCount: claimed + running,
    };
  }
}

export const queueService = new QueueService();
