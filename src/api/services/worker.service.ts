import prisma from '../../shared/db';
import { NotFoundError } from '../../shared/errors';
import { socketService } from './socket.service';

export class WorkerService {
  /** List all workers with their current status */
  async list() {
    return prisma.worker.findMany({
      orderBy: { startedAt: 'desc' },
      include: {
        _count: {
          select: { jobs: true },
        },
      },
    });
  }

  /** Get worker detail */
  async getById(id: string) {
    const worker = await prisma.worker.findUnique({
      where: { id },
      include: {
        jobs: {
          where: { status: { in: ['claimed', 'running'] } },
          select: {
            id: true,
            type: true,
            status: true,
            claimedAt: true,
            startedAt: true,
          },
        },
        heartbeats: {
          orderBy: { timestamp: 'desc' },
          take: 20,
        },
        _count: {
          select: { jobs: true, executions: true },
        },
      },
    });

    if (!worker) throw new NotFoundError('Worker', id);
    return worker;
  }

  /** Register a new worker (called by worker process on startup) */
  async register(data: {
    id: string;
    hostname: string;
    pid: number;
    queues: string[];
    concurrency: number;
  }) {
    const worker = await prisma.worker.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        hostname: data.hostname,
        pid: data.pid,
        queues: data.queues,
        concurrency: data.concurrency,
        status: 'online',
      },
      update: {
        hostname: data.hostname,
        pid: data.pid,
        queues: data.queues,
        concurrency: data.concurrency,
        status: 'online',
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    });
    socketService.broadcastGlobal('worker:updated', worker);
    return worker;
  }

  /** Update heartbeat (called periodically by worker) */
  async heartbeat(workerId: string, activeJobCount: number) {
    const now = new Date();

    // Update worker's last_heartbeat_at
    const worker = await prisma.worker.update({
      where: { id: workerId },
      data: { lastHeartbeatAt: now },
    });

    // Record heartbeat history
    await prisma.workerHeartbeat.create({
      data: {
        workerId,
        activeJobCount,
      },
    });

    socketService.broadcastGlobal('worker:heartbeat', {
      workerId,
      activeJobCount,
      lastHeartbeatAt: now,
      hostname: worker.hostname,
    });
  }

  /** Mark worker as draining or offline */
  async updateStatus(workerId: string, status: 'online' | 'offline' | 'draining') {
    const worker = await prisma.worker.update({
      where: { id: workerId },
      data: { status },
    });
    socketService.broadcastGlobal('worker:updated', worker);
    return worker;
  }

  /** Release claimed-but-not-started jobs back to queued */
  async releaseClaimedJobs(workerId: string) {
    return prisma.job.updateMany({
      where: {
        claimedByWorkerId: workerId,
        status: 'claimed',
      },
      data: {
        status: 'queued',
        claimedByWorkerId: null,
        claimedAt: null,
      },
    });
  }
}

export const workerService = new WorkerService();
