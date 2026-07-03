import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors';
import { createLogger } from '../../shared/logger';

const logger = createLogger('error-handler');

/**
 * Central error handler — converts AppError instances to the standard
 * { error: { code, message, details } } envelope. Unknown errors become 500s.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    const errorBody: Record<string, unknown> = {
      code: err.code,
      message: err.message,
    };
    if (err.details) {
      errorBody.details = err.details;
    }
    res.status(err.statusCode).json({ error: errorBody });
    return;
  }

  // Log unexpected errors with request context
  logger.error(
    {
      err: err.message,
      stack: err.stack,
      requestId: req.requestId,
      method: req.method,
      path: req.path,
    },
    'Unhandled error'
  );

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
