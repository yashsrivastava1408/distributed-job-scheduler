import dotenv from 'dotenv';
dotenv.config();

import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { createLogger } from '../shared/logger';
import { workerService } from '../api/services/worker.service';
import { claimJobs } from './claimer';
import { executeJob } from './executor';
import { HeartbeatEmitter } from './heartbeat';
import { setupGracefulShutdown } from './shutdown';
import { registerHandler, setDefaultHandler } from './handlers/registry';
import { simulateHandler, httpRequestHandler, logHandler } from './handlers/simulate';
import prisma from '../shared/db';

const logger = createLogger('worker');

// ─── Configuration ──────────────────────────────────────────────────

const WORKER_ID = uuidv4();
const HOSTNAME = os.hostname();
const PID = process.pid;
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '2000', 10);
const QUEUE_NAMES = (process.env.WORKER_QUEUES || 'default').split(',').map((s) => s.trim());

// ─── State ──────────────────────────────────────────────────────────

const runningJobs = new Set<string>();
let pollInterval: ReturnType<typeof setInterval> | null = null;

// ─── Register Handlers ──────────────────────────────────────────────

registerHandler('simulate', simulateHandler);
registerHandler('http-request', httpRequestHandler);
registerHandler('log', logHandler);
setDefaultHandler(simulateHandler); // Default: simulate

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  logger.info(
    {
      workerId: WORKER_ID,
      hostname: HOSTNAME,
      pid: PID,
      concurrency: CONCURRENCY,
      pollIntervalMs: POLL_INTERVAL_MS,
      queues: QUEUE_NAMES,
    },
    'Worker starting'
  );

  // Register this worker in the database
  await workerService.register({
    id: WORKER_ID,
    hostname: HOSTNAME,
    pid: PID,
    queues: QUEUE_NAMES,
    concurrency: CONCURRENCY,
  });

  const queueToProjectMap = new Map<string, string>();

  // Resolve queue names to IDs
  const queueRecords = await prisma.queue.findMany({
    where: {
      name: { in: QUEUE_NAMES },
    },
    select: { id: true, name: true, projectId: true },
  });

  // If no named queues found, poll ALL queues
  let queueIds: string[];
  if (queueRecords.length === 0) {
    logger.warn(
      { queueNames: QUEUE_NAMES },
      'No matching queues found — will poll all queues'
    );
    const allQueues = await prisma.queue.findMany({ select: { id: true, projectId: true } });
    queueIds = allQueues.map((q) => q.id);
    for (const q of allQueues) {
      queueToProjectMap.set(q.id, q.projectId);
    }
  } else {
    queueIds = queueRecords.map((q) => q.id);
    for (const q of queueRecords) {
      queueToProjectMap.set(q.id, q.projectId);
    }
    logger.info(
      { queues: queueRecords.map((q) => `${q.name} (${q.id})`) },
      'Resolved queue IDs'
    );
  }

  // Start heartbeat
  const heartbeat = new HeartbeatEmitter(
    WORKER_ID,
    () => runningJobs.size,
    5000
  );
  heartbeat.start();

  // Setup graceful shutdown
  const isShuttingDown = setupGracefulShutdown(
    WORKER_ID,
    () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      heartbeat.stop();
    },
    () => runningJobs,
    30000
  );

  // ─── Poll Loop ──────────────────────────────────────────────────

  async function poll() {
    if (isShuttingDown()) return;

    // Re-resolve queue IDs periodically (handles new queues)
    if (queueIds.length === 0) {
      const allQueues = await prisma.queue.findMany({ select: { id: true, projectId: true } });
      queueIds = allQueues.map((q) => q.id);
      for (const q of allQueues) {
        queueToProjectMap.set(q.id, q.projectId);
      }
    }

    if (queueIds.length === 0) return;

    const freeSlots = CONCURRENCY - runningJobs.size;
    if (freeSlots <= 0) return;

    const jobs = await claimJobs(WORKER_ID, queueIds, freeSlots);

    // Lazily load socketService to broadcast claiming events
    const { socketService } = await import('../api/services/socket.service');

    for (const job of jobs) {
      runningJobs.add(job.id);

      // Broadcast claiming event
      const projectId = queueToProjectMap.get(job.queue_id);
      if (projectId) {
        socketService.broadcastToProject(projectId, 'job:updated', {
          id: job.id,
          queueId: job.queue_id,
          type: job.type,
          payload: job.payload,
          status: 'claimed',
          priority: job.priority,
          attemptCount: job.attempt_count,
          maxAttempts: job.max_attempts,
          runAt: job.run_at,
          claimedByWorkerId: job.claimed_by_worker_id,
          claimedAt: job.claimed_at,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        });
      }

      // Execute asynchronously — don't block the poll loop
      executeJob(job, WORKER_ID)
        .catch((err) => {
          logger.error(
            { jobId: job.id, err: (err as Error).message },
            'Unhandled execution error'
          );
        })
        .finally(() => {
          runningJobs.delete(job.id);
        });
    }
  }

  // Initial poll
  await poll();

  // Start polling
  pollInterval = setInterval(poll, POLL_INTERVAL_MS);

  logger.info(
    { workerId: WORKER_ID, pollIntervalMs: POLL_INTERVAL_MS },
    'Worker is polling for jobs'
  );
}

// ─── Entry Point ────────────────────────────────────────────────────

main().catch((err) => {
  logger.error({ err: err.message }, 'Worker failed to start');
  process.exit(1);
});
