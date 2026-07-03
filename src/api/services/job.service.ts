import { Prisma } from '@prisma/client';
import prisma from '../../shared/db';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors';
import { calculateRetryDelay, toRetryConfig, DEFAULT_RETRY_CONFIG, RetryConfig } from '../../shared/retry';
import { PaginationParams } from '../../shared/types';
import { socketService } from './socket.service';

export class JobService {
  /** Create a single job in a queue */
  async create(
    queueId: string,
    data: {
      type: string;
      payload?: Record<string, unknown>;
      priority?: number;
      runAt?: string;
      idempotencyKey?: string;
      maxAttempts?: number;
    }
  ) {
    const queue = await prisma.queue.findUnique({
      where: { id: queueId },
      include: { defaultRetryPolicy: true },
    });
    if (!queue) throw new NotFoundError('Queue', queueId);

    // Idempotency check
    if (data.idempotencyKey) {
      const existing = await prisma.job.findUnique({
        where: {
          queueId_idempotencyKey: {
            queueId,
            idempotencyKey: data.idempotencyKey,
          },
        },
      });
      if (existing) {
        return { job: existing, created: false };
      }
    }

    const maxAttempts =
      data.maxAttempts ?? queue.defaultRetryPolicy?.maxAttempts ?? 3;

    const job = await prisma.job.create({
      data: {
        queueId,
        type: data.type,
        payload: (data.payload ?? {}) as Prisma.InputJsonValue,
        priority: data.priority ?? queue.priority,
        runAt: data.runAt ? new Date(data.runAt) : new Date(),
        idempotencyKey: data.idempotencyKey,
        maxAttempts,
        retryPolicyId: queue.defaultRetryPolicyId,
      },
    });

    socketService.broadcastToProject(queue.projectId, 'job:created', job);

    return { job, created: true };
  }

  /** Create a batch of jobs */
  async createBatch(
    queueId: string,
    data: {
      label?: string;
      jobs: Array<{
        type: string;
        payload?: Record<string, unknown>;
        priority?: number;
        runAt?: string;
      }>;
    }
  ) {
    const queue = await prisma.queue.findUnique({
      where: { id: queueId },
      include: { defaultRetryPolicy: true },
    });
    if (!queue) throw new NotFoundError('Queue', queueId);

    if (data.jobs.length === 0) {
      throw new ValidationError('Batch must contain at least one job');
    }
    if (data.jobs.length > 1000) {
      throw new ValidationError('Batch cannot exceed 1000 jobs');
    }

    return prisma.$transaction(async (tx) => {
      const batch = await tx.jobBatch.create({
        data: {
          queueId,
          label: data.label,
          totalJobs: data.jobs.length,
        },
      });

      const maxAttempts = queue.defaultRetryPolicy?.maxAttempts ?? 3;

      await tx.job.createMany({
        data: data.jobs.map((j: { type: string; payload?: Record<string, unknown>; priority?: number; runAt?: string }) => ({
          queueId,
          batchId: batch.id,
          type: j.type,
          payload: (j.payload ?? {}) as Prisma.InputJsonValue,
          priority: j.priority ?? queue.priority,
          runAt: j.runAt ? new Date(j.runAt) : new Date(),
          maxAttempts,
          retryPolicyId: queue.defaultRetryPolicyId,
        })),
      });

      const jobs = await tx.job.findMany({
        where: { batchId: batch.id },
        orderBy: { createdAt: 'asc' },
      });

      socketService.broadcastToProject(queue.projectId, 'batch:created', { batch, jobs });

      return { batch, jobs };
    });
  }

  /** List jobs in a queue with filters and pagination */
  async listForQueue(
    queueId: string,
    pagination: PaginationParams,
    filters?: {
      status?: string;
      type?: string;
      from?: string;
      to?: string;
    }
  ) {
    const where: any = { queueId };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          _count: { select: { executions: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, total };
  }

  /** Get full job detail including executions and logs */
  async getById(id: string) {
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        queue: { select: { id: true, name: true, projectId: true } },
        retryPolicy: true,
        claimedByWorker: {
          select: { id: true, hostname: true, pid: true, status: true },
        },
        batch: true,
        executions: {
          orderBy: { attemptNumber: 'asc' },
          include: {
            worker: { select: { id: true, hostname: true } },
            logs: { orderBy: { timestamp: 'asc' } },
          },
        },
        deadLetterEntry: true,
      },
    });

    if (!job) throw new NotFoundError('Job', id);
    return job;
  }

  /** Cancel a job (only if queued, scheduled, or running) */
  async cancel(id: string) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundError('Job', id);

    const cancellableStatuses = ['queued', 'scheduled', 'claimed', 'running'];
    if (!cancellableStatuses.includes(job.status)) {
      throw new ConflictError(
        `Cannot cancel job in '${job.status}' state. Only jobs in ${cancellableStatuses.join(', ')} states can be cancelled.`
      );
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
      },
      include: { queue: { select: { projectId: true } } },
    });

    socketService.broadcastToProject(updatedJob.queue.projectId, 'job:updated', updatedJob);

    return updatedJob;
  }

  /** Manually retry a failed or dead-lettered job */
  async retry(id: string) {
    const job = await prisma.job.findUnique({
      where: { id },
      include: { deadLetterEntry: true },
    });
    if (!job) throw new NotFoundError('Job', id);

    const retryableStatuses = ['failed', 'dead_letter', 'cancelled'];
    if (!retryableStatuses.includes(job.status)) {
      throw new ConflictError(
        `Cannot retry job in '${job.status}' state. Only failed, dead_letter, or cancelled jobs can be retried.`
      );
    }

    // If it was in DLQ, remove the entry
    if (job.deadLetterEntry) {
      await prisma.deadLetterEntry.delete({
        where: { id: job.deadLetterEntry.id },
      });
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        status: 'queued',
        runAt: new Date(),
        attemptCount: 0,
        lastError: null,
        claimedByWorkerId: null,
        claimedAt: null,
        startedAt: null,
        completedAt: null,
      },
      include: { queue: { select: { projectId: true } } },
    });

    socketService.broadcastToProject(updatedJob.queue.projectId, 'job:updated', updatedJob);

    return updatedJob;
  }

  /** Handle job completion (called by worker) */
  async complete(jobId: string, workerId: string, durationMs: number) {
    return prisma.$transaction(async (tx) => {
      const job = await tx.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
        include: { queue: { select: { projectId: true } } },
      });

      // Update the execution record
      await tx.jobExecution.updateMany({
        where: {
          jobId,
          workerId,
          status: 'running',
        },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          durationMs,
        },
      });

      // Update batch counters if part of a batch
      if (job.batchId) {
        await tx.jobBatch.update({
          where: { id: job.batchId },
          data: { completedJobs: { increment: 1 } },
        });
      }

      socketService.broadcastToProject(job.queue.projectId, 'job:updated', job);

      return job;
    });
  }

  /** Handle job failure (called by worker) */
  async fail(
    jobId: string,
    workerId: string,
    error: { message: string; stack?: string },
    durationMs: number
  ) {
    return prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({
        where: { id: jobId },
        include: { retryPolicy: true, queue: { include: { defaultRetryPolicy: true } } },
      });
      if (!job) throw new NotFoundError('Job', jobId);

      // Update the execution record
      await tx.jobExecution.updateMany({
        where: { jobId, workerId, status: 'running' },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          durationMs,
          errorMessage: error.message,
          errorStack: error.stack,
        },
      });

      // Determine retry policy
      const retryPolicy = job.retryPolicy ?? job.queue.defaultRetryPolicy;
      const retryConfig: RetryConfig = retryPolicy
        ? toRetryConfig(retryPolicy)
        : DEFAULT_RETRY_CONFIG;

      const maxAttempts = job.maxAttempts ?? retryConfig.maxAttempts;
      const shouldRetryJob = job.attemptCount < maxAttempts;

      let updatedJob;

      if (shouldRetryJob) {
        // Requeue with delay
        const delay = calculateRetryDelay(retryConfig, job.attemptCount);
        const nextRunAt = new Date(Date.now() + delay);

        updatedJob = await tx.job.update({
          where: { id: jobId },
          data: {
            status: 'queued',
            lastError: error.message,
            runAt: nextRunAt,
            claimedByWorkerId: null,
            claimedAt: null,
            startedAt: null,
          },
          include: { queue: { select: { projectId: true } } },
        });
      } else {
        // Move to dead letter queue
        updatedJob = await tx.job.update({
          where: { id: jobId },
          data: {
            status: 'dead_letter',
            lastError: error.message,
            completedAt: new Date(),
          },
          include: { queue: { select: { projectId: true } } },
        });

        await tx.deadLetterEntry.create({
          data: {
            jobId,
            queueId: job.queueId,
            payload: job.payload as any,
            finalError: error.message,
            totalAttempts: job.attemptCount,
          },
        });

        // Update batch counters
        if (job.batchId) {
          await tx.jobBatch.update({
            where: { id: job.batchId },
            data: { failedJobs: { increment: 1 } },
          });
        }
      }

      socketService.broadcastToProject(updatedJob.queue.projectId, 'job:updated', updatedJob);

      return { retried: shouldRetryJob };
    });
  }

  /** Get DLQ entries for a queue */
  async getDlqEntries(queueId: string, pagination: PaginationParams) {
    const [entries, total] = await Promise.all([
      prisma.deadLetterEntry.findMany({
        where: { queueId },
        orderBy: { movedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          job: {
            select: {
              id: true,
              type: true,
              attemptCount: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.deadLetterEntry.count({ where: { queueId } }),
    ]);

    return { entries, total };
  }

  /** Requeue a DLQ entry */
  async requeueFromDlq(dlqEntryId: string) {
    const entry = await prisma.deadLetterEntry.findUnique({
      where: { id: dlqEntryId },
      include: { job: true },
    });
    if (!entry) throw new NotFoundError('DLQ Entry', dlqEntryId);

    return prisma.$transaction(async (tx) => {
      // Remove from DLQ
      await tx.deadLetterEntry.delete({ where: { id: dlqEntryId } });

      // Requeue the job
      const job = await tx.job.update({
        where: { id: entry.jobId },
        data: {
          status: 'queued',
          runAt: new Date(),
          attemptCount: 0,
          lastError: null,
          claimedByWorkerId: null,
          claimedAt: null,
          startedAt: null,
          completedAt: null,
        },
        include: { queue: { select: { projectId: true } } },
      });

      socketService.broadcastToProject(job.queue.projectId, 'job:updated', job);

      return job;
    });
  }
}

export const jobService = new JobService();
