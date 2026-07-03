import { ExecutionContext } from '../executor';
import { createLogger } from '../../shared/logger';

const logger = createLogger('handler-registry');

/**
 * Job handler function signature.
 * Receives the job's JSON payload and an execution context for logging.
 * Should throw on failure.
 */
export type JobHandler = (
  payload: Record<string, unknown>,
  ctx: ExecutionContext
) => Promise<void>;

/** Registry mapping job types to handler functions */
const handlers = new Map<string, JobHandler>();

/** Default handler for unregistered job types */
let defaultHandler: JobHandler | null = null;

/**
 * Register a handler for a specific job type.
 */
export function registerHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
  logger.info({ type }, 'Registered job handler');
}

/**
 * Set the default handler used when no specific handler matches the job type.
 */
export function setDefaultHandler(handler: JobHandler) {
  defaultHandler = handler;
  logger.info('Set default job handler');
}

/**
 * Get the handler for a job type.
 * Falls back to the default handler, or throws if neither exists.
 */
export function getHandler(type: string): JobHandler {
  const handler = handlers.get(type) ?? defaultHandler;
  if (!handler) {
    throw new Error(`No handler registered for job type '${type}'`);
  }
  return handler;
}

/**
 * List all registered handler types (useful for dashboard / debugging).
 */
export function listRegisteredTypes(): string[] {
  return Array.from(handlers.keys());
}
