import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates or propagates a unique request ID for tracing.
 * Supports incoming X-Request-Id headers for distributed tracing.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  req.requestId = id;
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-Id', id);
  next();
}
