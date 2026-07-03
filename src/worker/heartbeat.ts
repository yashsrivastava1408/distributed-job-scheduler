import { workerService } from '../api/services/worker.service';
import { createLogger } from '../shared/logger';

const logger = createLogger('heartbeat');

/**
 * Heartbeat emitter — periodically updates the worker's last_heartbeat_at
 * so the reaper knows this worker is alive.
 */
export class HeartbeatEmitter {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private workerId: string,
    private getActiveJobCount: () => number,
    private intervalMs: number = 5000
  ) {}

  start() {
    logger.info(
      { workerId: this.workerId, intervalMs: this.intervalMs },
      'Starting heartbeat'
    );

    this.beat();
    this.intervalHandle = setInterval(() => this.beat(), this.intervalMs);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info({ workerId: this.workerId }, 'Heartbeat stopped');
    }
  }

  private async beat() {
    try {
      const activeJobCount = this.getActiveJobCount();
      await workerService.heartbeat(this.workerId, activeJobCount);
    } catch (error) {
      logger.error(
        { workerId: this.workerId, err: (error as Error).message },
        'Heartbeat failed'
      );
    }
  }
}
