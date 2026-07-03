import { CronExpressionParser } from 'cron-parser';
import { Prisma } from '@prisma/client';
import prisma from '../../shared/db';
import { createLogger } from '../../shared/logger';
import { NotFoundError, ValidationError } from '../../shared/errors';

const logger = createLogger('scheduler');

/**
 * Scheduler Daemon — materializes scheduled_jobs into the jobs table.
 *
 * Periodically scans for scheduled_jobs whose next_run_at <= now() and
 * creates concrete job rows. For cron schedules, computes the next run;
 * for one-time schedules, deactivates after firing.
 *
 * Uses pg_advisory_lock to ensure only one scheduler instance runs
 * the materialization, even if multiple API server instances are running.
 */
export class SchedulerService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private static readonly ADVISORY_LOCK_ID = 123456789; // arbitrary unique ID

  /** Start the scheduler loop */
  start(pollIntervalMs: number) {
    logger.info({ pollIntervalMs }, 'Starting scheduler daemon');

    this.tick();
    this.intervalHandle = setInterval(() => {
      this.tick();
    }, pollIntervalMs);
  }

  /** Stop the scheduler loop */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('Scheduler daemon stopped');
    }
  }

  /** Single scheduler pass */
  private async tick() {
    try {
      // Acquire advisory lock — only one scheduler instance runs at a time
      const lockResult = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`
        SELECT pg_try_advisory_lock(${SchedulerService.ADVISORY_LOCK_ID})
      `;

      const acquired = lockResult[0]?.pg_try_advisory_lock;
      if (!acquired) {
        return; // Another instance holds the lock
      }

      try {
        await this.materializeScheduledJobs();
      } finally {
        // Release advisory lock
        await prisma.$queryRaw`
          SELECT pg_advisory_unlock(${SchedulerService.ADVISORY_LOCK_ID})
        `;
      }
    } catch (error) {
      logger.error({ err: (error as Error).message }, 'Scheduler tick failed');
    }
  }

  /** Find due scheduled jobs and create concrete job rows */
  private async materializeScheduledJobs() {
    const now = new Date();

    const dueJobs = await prisma.scheduledJob.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
      include: {
        queue: {
          select: { id: true, isPaused: true, defaultRetryPolicyId: true, priority: true },
        },
      },
    });

    if (dueJobs.length === 0) return;

    logger.info({ count: dueJobs.length }, 'Materializing scheduled jobs');

    for (const scheduled of dueJobs) {
      try {
        // Skip if queue is paused
        if (scheduled.queue.isPaused) {
          logger.debug(
            { scheduledJobId: scheduled.id, queueId: scheduled.queueId },
            'Skipping — queue is paused'
          );
          continue;
        }

        // Create the concrete job
        await prisma.job.create({
          data: {
            queueId: scheduled.queueId,
            type: scheduled.type,
            payload: scheduled.payload as Prisma.InputJsonValue,
            priority: scheduled.queue.priority,
            maxAttempts: scheduled.maxAttempts,
            retryPolicyId: scheduled.queue.defaultRetryPolicyId,
            runAt: now,
          },
        });

        // Update the scheduled job
        if (scheduled.scheduleType === 'once') {
          await prisma.scheduledJob.update({
            where: { id: scheduled.id },
            data: { isActive: false },
          });
        } else if (scheduled.scheduleType === 'cron' && scheduled.cronExpression) {
          // Compute next run time from cron expression
          const interval = CronExpressionParser.parse(scheduled.cronExpression, {
            currentDate: now,
          });
          const nextRun = interval.next().toDate();

          await prisma.scheduledJob.update({
            where: { id: scheduled.id },
            data: { nextRunAt: nextRun },
          });
        }

        logger.info(
          { scheduledJobId: scheduled.id, type: scheduled.type },
          'Materialized scheduled job'
        );
      } catch (error) {
        logger.error(
          {
            scheduledJobId: scheduled.id,
            err: (error as Error).message,
          },
          'Failed to materialize scheduled job'
        );
      }
    }
  }

  /** Create a scheduled job (cron or one-time) */
  async createScheduledJob(
    queueId: string,
    data: {
      type: string;
      payload?: Record<string, unknown>;
      scheduleType: 'once' | 'cron';
      cronExpression?: string;
      runAt?: string;
      maxAttempts?: number;
    }
  ) {
    const queue = await prisma.queue.findUnique({ where: { id: queueId } });
    if (!queue) {
      throw new NotFoundError('Queue', queueId);
    }

    let nextRunAt: Date | null = null;

    if (data.scheduleType === 'once') {
      if (!data.runAt) {
        throw new ValidationError('runAt is required for one-time schedules');
      }
      nextRunAt = new Date(data.runAt);
    } else if (data.scheduleType === 'cron') {
      if (!data.cronExpression) {
        throw new ValidationError('cronExpression is required for cron schedules');
      }
      // Validate cron expression and compute first run
      try {
        const interval = CronExpressionParser.parse(data.cronExpression);
        nextRunAt = interval.next().toDate();
      } catch {
        throw new ValidationError(`Invalid cron expression: ${data.cronExpression}`);
      }
    }

    return prisma.scheduledJob.create({
      data: {
        queueId,
        type: data.type,
        payload: (data.payload ?? {}) as Prisma.InputJsonValue,
        scheduleType: data.scheduleType,
        cronExpression: data.cronExpression,
        runAt: data.runAt ? new Date(data.runAt) : null,
        nextRunAt,
        maxAttempts: data.maxAttempts ?? 3,
      },
    });
  }
}

export const schedulerService = new SchedulerService();
