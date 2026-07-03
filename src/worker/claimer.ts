import { Prisma } from '@prisma/client';
import prisma from '../shared/db';
import { createLogger } from '../shared/logger';

const logger = createLogger('claimer');

export interface ClaimedJob {
  id: string;
  queue_id: string;
  type: string;
  payload: any;
  status: string;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  retry_policy_id: string | null;
  run_at: Date;
  claimed_by_worker_id: string;
  claimed_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  last_error: string | null;
  batch_id: string | null;
  idempotency_key: string | null;
  parent_job_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Atomically claim jobs from the database using SELECT ... FOR UPDATE SKIP LOCKED.
 *
 * This is the core reliability mechanism — ensures no two workers ever claim
 * the same job, even under high concurrency. SKIP LOCKED means workers don't
 * block each other; they simply skip rows already locked by another transaction.
 *
 * Also enforces queue-level concurrency limits by capping the LIMIT based on
 * how many jobs are currently active in each queue.
 */
export async function claimJobs(
  workerId: string,
  queueIds: string[],
  maxJobs: number
): Promise<ClaimedJob[]> {
  if (queueIds.length === 0 || maxJobs <= 0) return [];

  try {
    return await prisma.$transaction(async (tx) => {
      // Check which queues are paused and get their concurrency limits
      const queues = await tx.queue.findMany({
        where: {
          id: { in: queueIds },
          isPaused: false,
        },
        select: { id: true, maxConcurrency: true },
      });

      if (queues.length === 0) return [];

      const claimed: ClaimedJob[] = [];
      let remainingMaxJobs = maxJobs;

      for (const queue of queues) {
        if (remainingMaxJobs <= 0) break;

        // Check active job counts per queue to enforce concurrency limits
        const activeCount = await tx.job.count({
          where: {
            queueId: queue.id,
            status: { in: ['claimed', 'running'] },
          },
        });

        const capacity = queue.maxConcurrency - activeCount;
        if (capacity <= 0) continue;

        const limit = Math.min(capacity, remainingMaxJobs);

        // Atomic claim for this queue
        const queueClaimed = await tx.$queryRaw<ClaimedJob[]>`
          WITH next_jobs AS (
            SELECT id FROM jobs
            WHERE queue_id::text = ${queue.id}
              AND status = 'queued'
              AND run_at <= NOW()
            ORDER BY priority DESC, run_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${limit}
          )
          UPDATE jobs
          SET status = 'claimed',
              claimed_by_worker_id = ${workerId}::uuid,
              claimed_at = NOW(),
              attempt_count = attempt_count + 1,
              updated_at = NOW()
          FROM next_jobs
          WHERE jobs.id = next_jobs.id
          RETURNING jobs.*
        `;

        claimed.push(...queueClaimed);
        remainingMaxJobs -= queueClaimed.length;
      }

      if (claimed.length > 0) {
        logger.info(
          { workerId, claimedCount: claimed.length, jobIds: claimed.map((j) => j.id) },
          'Claimed jobs'
        );
      }

      return claimed;
    });
  } catch (error) {
    logger.error(
      { workerId, err: (error as Error).message },
      'Failed to claim jobs'
    );
    return [];
  }
}
