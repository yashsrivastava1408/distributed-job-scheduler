/**
 * Retry delay calculators for fixed, linear, and exponential strategies.
 * These are pure functions — easy to unit test.
 */

export type RetryStrategyType = 'fixed' | 'linear' | 'exponential';

export interface RetryConfig {
  strategy: RetryStrategyType;
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  jitter: boolean;
}

/**
 * Calculate the delay before the next retry attempt.
 *
 * - fixed:       delay = baseDelayMs
 * - linear:      delay = baseDelayMs × attemptNumber
 * - exponential: delay = min(baseDelayMs × 2^(attemptNumber-1), maxDelayMs)
 *
 * If jitter is enabled, ±25% random jitter is applied to prevent thundering herd.
 */
export function calculateRetryDelay(
  config: RetryConfig,
  attemptNumber: number
): number {
  let delay: number;

  switch (config.strategy) {
    case 'fixed':
      delay = config.baseDelayMs;
      break;
    case 'linear':
      delay = config.baseDelayMs * attemptNumber;
      break;
    case 'exponential':
      delay = Math.min(
        config.baseDelayMs * Math.pow(2, attemptNumber - 1),
        config.maxDelayMs
      );
      break;
    default:
      delay = config.baseDelayMs;
  }

  // Clamp to maxDelayMs
  delay = Math.min(delay, config.maxDelayMs);

  if (config.jitter) {
    // ±25% jitter to avoid thundering herd on retries
    const jitterRange = delay * 0.25;
    delay += (Math.random() * 2 - 1) * jitterRange;
  }

  return Math.max(0, Math.round(delay));
}

/**
 * Whether the job should be retried based on current attempt count.
 */
export function shouldRetry(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount < maxAttempts;
}

/**
 * Build a RetryConfig from a Prisma RetryPolicy row.
 */
export function toRetryConfig(policy: {
  strategy: string;
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  jitter: boolean;
}): RetryConfig {
  return {
    strategy: policy.strategy as RetryStrategyType,
    baseDelayMs: policy.baseDelayMs,
    maxDelayMs: policy.maxDelayMs,
    maxAttempts: policy.maxAttempts,
    jitter: policy.jitter,
  };
}

/** Default retry config when no policy is specified */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  strategy: 'exponential',
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  maxAttempts: 3,
  jitter: true,
};
