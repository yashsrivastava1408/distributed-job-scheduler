import { describe, it, expect } from 'vitest';
import { calculateRetryDelay } from '../../src/shared/retry';

describe('Retry Calculations', () => {
  const config = {
    strategy: 'fixed' as const,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    maxAttempts: 3,
    jitter: false,
  };

  it('calculates fixed delay correctly', () => {
    const delay = calculateRetryDelay({ ...config, strategy: 'fixed' }, 1);
    expect(delay).toBe(1000);
  });

  it('calculates linear delay correctly', () => {
    const delay1 = calculateRetryDelay({ ...config, strategy: 'linear' }, 1);
    const delay2 = calculateRetryDelay({ ...config, strategy: 'linear' }, 2);
    expect(delay1).toBe(1000);
    expect(delay2).toBe(2000);
  });

  it('calculates exponential delay correctly', () => {
    const delay1 = calculateRetryDelay({ ...config, strategy: 'exponential' }, 1);
    const delay2 = calculateRetryDelay({ ...config, strategy: 'exponential' }, 2);
    const delay3 = calculateRetryDelay({ ...config, strategy: 'exponential' }, 3);
    expect(delay1).toBe(1000); // 1000 * 2^0
    expect(delay2).toBe(2000); // 1000 * 2^1
    expect(delay3).toBe(4000); // 1000 * 2^2
  });

  it('clamps delay to maxDelayMs', () => {
    const delay = calculateRetryDelay({ ...config, strategy: 'exponential', maxDelayMs: 3000 }, 5);
    expect(delay).toBe(3000);
  });

  it('applies jitter if enabled', () => {
    const delay = calculateRetryDelay({ ...config, strategy: 'fixed', jitter: true }, 1);
    // Jitter range is 1000 * 25% = 250. Result should be in [750, 1250].
    expect(delay).toBeGreaterThanOrEqual(750);
    expect(delay).toBeLessThanOrEqual(1250);
  });
});
