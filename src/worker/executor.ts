import prisma from '../shared/db';
import { createLogger } from '../shared/logger';
import { getHandler } from './handlers/registry';
import { ClaimedJob } from './claimer';

const logger = createLogger('executor');

export interface ExecutionContext {
  jobId: string;
  type: string;
  attemptNumber: number;
  executionId: string;
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => Promise<void>;
}

/**
 * Execute a claimed job:
 * 1. Transition to 'running', create execution record
 * 2. Look up handler by job.type and invoke it
 * 3. On success: mark completed, record duration
 * 4. On failure: delegate to job.service.fail() for retry/DLQ logic
 */
export async function executeJob(
  job: ClaimedJob,
  workerId: string
): Promise<void> {
  const jobLogger = logger.child({ jobId: job.id, type: job.type, attempt: job.attempt_count });
  const startTime = Date.now();

  // Create execution record and transition to running
  let executionId: string;
  try {
    const execution = await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        attemptNumber: job.attempt_count,
        workerId,
        status: 'running',
      },
    });
    executionId = execution.id;

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });
  } catch (error) {
    jobLogger.error(
      { err: (error as Error).message },
      'Failed to start execution'
    );
    return;
  }

  // Build execution context with log helper
  const ctx: ExecutionContext = {
    jobId: job.id,
    type: job.type,
    attemptNumber: job.attempt_count,
    executionId,
    log: async (level, message) => {
      try {
        await prisma.jobLog.create({
          data: {
            jobExecutionId: executionId,
            level,
            message,
          },
        });
      } catch {
        // Don't fail the job because of a log write failure
      }
    },
  };

  // Look up and execute the handler
  const handler = getHandler(job.type);
  jobLogger.info('Executing job');

  try {
    await ctx.log('info', `Starting execution (attempt ${job.attempt_count})`);

    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    await handler(payload, ctx);

    const durationMs = Date.now() - startTime;

    // Import job service lazily to avoid circular deps
    const { jobService } = await import('../api/services/job.service');
    await jobService.complete(job.id, workerId, durationMs);

    await ctx.log('info', `Completed in ${durationMs}ms`);
    jobLogger.info({ durationMs }, 'Job completed');
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error as Error;

    await ctx.log('error', `Failed: ${err.message}`);

    const { jobService } = await import('../api/services/job.service');
    const result = await jobService.fail(
      job.id,
      workerId,
      { message: err.message, stack: err.stack },
      durationMs
    );

    if (result.retried) {
      jobLogger.warn({ durationMs, err: err.message }, 'Job failed — will retry');
    } else {
      jobLogger.error({ durationMs, err: err.message }, 'Job failed — moved to DLQ');
    }
  }
}
