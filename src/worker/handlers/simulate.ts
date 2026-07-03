import { JobHandler } from './registry';

/**
 * Simulation handler — mimics real job execution with configurable
 * delay and failure rate. Used for demo/testing purposes.
 *
 * Payload options:
 *   - durationMs: number (default: random 1000-5000ms)
 *   - failureRate: number 0-1 (default: 0.1 = 10% chance of failure)
 *   - failMessage: string (default: "Simulated failure")
 */
export const simulateHandler: JobHandler = async (payload, ctx) => {
  const durationMs =
    (payload.durationMs as number) ??
    Math.floor(Math.random() * 4000) + 1000; // 1-5 seconds
  const failureRate = (payload.failureRate as number) ?? 0.1;
  const failMessage = (payload.failMessage as string) ?? 'Simulated failure';

  await ctx.log('info', `Simulating job (${durationMs}ms, ${(failureRate * 100).toFixed(0)}% failure rate)`);

  // Simulate work
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  // Random failure based on failure rate
  if (Math.random() < failureRate) {
    await ctx.log('error', failMessage);
    throw new Error(failMessage);
  }

  await ctx.log('info', 'Simulation completed successfully');
};

/**
 * HTTP request handler — makes an HTTP request to a URL.
 *
 * Payload:
 *   - url: string (required)
 *   - method: string (default: GET)
 *   - headers: Record<string, string>
 *   - body: unknown
 *   - timeoutMs: number (default: 30000)
 */
export const httpRequestHandler: JobHandler = async (payload, ctx) => {
  const url = payload.url as string;
  if (!url) throw new Error('Missing required payload field: url');

  const method = (payload.method as string) ?? 'GET';
  const headers = (payload.headers as Record<string, string>) ?? {};
  const body = payload.body;
  const timeoutMs = (payload.timeoutMs as number) ?? 30000;

  await ctx.log('info', `Making ${method} request to ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    await ctx.log('info', `Response: ${response.status} ${response.statusText}`);
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
};

/**
 * Logging handler — simply logs the payload. Useful for testing.
 */
export const logHandler: JobHandler = async (payload, ctx) => {
  await ctx.log('info', `Job payload: ${JSON.stringify(payload)}`);
};
