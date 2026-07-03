import { workerService } from '../api/services/worker.service';
import { createLogger } from '../shared/logger';

const logger = createLogger('shutdown');

/**
 * Graceful shutdown handler.
 *
 * On SIGTERM/SIGINT:
 * 1. Stop polling for new jobs
 * 2. Mark worker as 'draining'
 * 3. Wait for in-flight jobs to finish (up to grace period)
 * 4. Release any claimed-but-not-started jobs back to 'queued'
 * 5. Mark worker as 'offline'
 * 6. Exit
 */
export function setupGracefulShutdown(
  workerId: string,
  stopPolling: () => void,
  getRunningJobs: () => Set<string>,
  gracePeriodMs: number = 30000
) {
  let isShuttingDown = false;

  async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal, workerId }, 'Graceful shutdown initiated');

    // 1. Stop accepting new jobs
    stopPolling();

    // 2. Mark as draining
    try {
      await workerService.updateStatus(workerId, 'draining');
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Failed to set draining status');
    }

    // 3. Wait for in-flight jobs to finish
    const deadline = Date.now() + gracePeriodMs;
    const runningJobs = getRunningJobs();

    while (runningJobs.size > 0 && Date.now() < deadline) {
      logger.info(
        { remaining: runningJobs.size, timeLeft: Math.round((deadline - Date.now()) / 1000) },
        'Waiting for in-flight jobs'
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (runningJobs.size > 0) {
      logger.warn(
        { abandoned: runningJobs.size },
        'Grace period exceeded — abandoning remaining jobs (reaper will recover them)'
      );
    }

    // 4. Release claimed-but-not-started jobs
    try {
      const released = await workerService.releaseClaimedJobs(workerId);
      logger.info({ released: released.count }, 'Released claimed jobs');
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Failed to release claimed jobs');
    }

    // 5. Mark offline
    try {
      await workerService.updateStatus(workerId, 'offline');
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Failed to set offline status');
    }

    logger.info({ workerId }, 'Worker shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return () => isShuttingDown;
}
