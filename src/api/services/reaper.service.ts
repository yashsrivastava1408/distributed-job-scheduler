import prisma from '../../shared/db';
import { createLogger } from '../../shared/logger';
import { calculateRetryDelay, toRetryConfig, DEFAULT_RETRY_CONFIG } from '../../shared/retry';

const logger = createLogger('reaper');

/**
 * Reaper — detects and recovers jobs stuck on crashed/unresponsive workers.
 *
 * Runs periodically and finds jobs in 'running' or 'claimed' state whose
 * owning worker hasn't sent a heartbeat within the stale threshold.
 * These jobs are either requeued (if retries remain) or moved to the DLQ.
 */
export class ReaperService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /** Start the reaper loop */
  start(pollIntervalMs: number, staleThresholdMs: number) {
    logger.info(
      { pollIntervalMs, staleThresholdMs },
      'Starting reaper daemon'
    );

    // Run immediately, then on interval
    this.reap(staleThresholdMs);
    this.intervalHandle = setInterval(() => {
      this.reap(staleThresholdMs);
    }, pollIntervalMs);
  }

  /** Stop the reaper loop */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('Reaper daemon stopped');
    }
  }

  /** Single reap pass */
  private async reap(staleThresholdMs: number) {
    try {
      const threshold = new Date(Date.now() - staleThresholdMs);

      // Find stale workers
      const staleWorkers = await prisma.worker.findMany({
        where: {
          status: { in: ['online', 'draining'] },
          lastHeartbeatAt: { lt: threshold },
        },
        select: { id: true, hostname: true, lastHeartbeatAt: true },
      });

      if (staleWorkers.length === 0) return;

      logger.warn(
        { staleWorkerCount: staleWorkers.length },
        'Found stale workers'
      );

      for (const worker of staleWorkers) {
        await this.recoverWorkerJobs(worker.id, worker.hostname);

        // Mark worker as offline
        await prisma.worker.update({
          where: { id: worker.id },
          data: { status: 'offline' },
        });
      }
    } catch (error) {
      logger.error(
        { err: (error as Error).message },
        'Reaper pass failed'
      );
    }
  }

  /** Recover all active jobs from a crashed worker */
  private async recoverWorkerJobs(workerId: string, hostname: string) {
    const stuckJobs = await prisma.job.findMany({
      where: {
        claimedByWorkerId: workerId,
        status: { in: ['claimed', 'running'] },
      },
      include: {
        retryPolicy: true,
        queue: { include: { defaultRetryPolicy: true } },
      },
    });

    if (stuckJobs.length === 0) return;

    logger.info(
      { workerId, hostname, jobCount: stuckJobs.length },
      'Recovering jobs from crashed worker'
    );

    for (const job of stuckJobs) {
      try {
        const retryPolicy = job.retryPolicy ?? job.queue.defaultRetryPolicy;
        const config = retryPolicy ? toRetryConfig(retryPolicy) : DEFAULT_RETRY_CONFIG;
        const shouldRetry = job.attemptCount < config.maxAttempts;

        if (shouldRetry) {
          const delay = calculateRetryDelay(config, job.attemptCount);
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: 'queued',
              runAt: new Date(Date.now() + delay),
              lastError: `Worker ${hostname} crashed or became unresponsive`,
              claimedByWorkerId: null,
              claimedAt: null,
              startedAt: null,
            },
          });
          logger.info({ jobId: job.id }, 'Requeued crashed job');
        } else {
          // Max attempts exhausted — move to DLQ
          await prisma.$transaction(async (tx) => {
            await tx.job.update({
              where: { id: job.id },
              data: {
                status: 'dead_letter',
                lastError: `Worker ${hostname} crashed — max attempts exhausted`,
                completedAt: new Date(),
              },
            });

            await tx.deadLetterEntry.create({
              data: {
                jobId: job.id,
                queueId: job.queueId,
                payload: job.payload as any,
                finalError: `Worker ${hostname} crashed — max attempts exhausted`,
                totalAttempts: job.attemptCount,
              },
            });
          });
          logger.warn({ jobId: job.id }, 'Moved crashed job to DLQ');
        }

        // Mark execution as timed_out if there's a running execution
        await prisma.jobExecution.updateMany({
          where: {
            jobId: job.id,
            workerId,
            status: 'running',
          },
          data: {
            status: 'timed_out',
            finishedAt: new Date(),
            errorMessage: `Worker ${hostname} crashed or became unresponsive`,
          },
        });
      } catch (error) {
        logger.error(
          { jobId: job.id, err: (error as Error).message },
          'Failed to recover job'
        );
      }
    }
  }
}

export const reaperService = new ReaperService();
