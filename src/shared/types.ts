/**
 * Shared types — response envelopes, pagination, and helper utilities.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { TokenPayload } from './jwt';

// ─── Response Envelopes ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Response Helpers ───────────────────────────────────────────────

export function success<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return { data, ...(meta && { meta }) };
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Pagination Query Parsing ───────────────────────────────────────

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'), 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// ─── Async Handler ──────────────────────────────────────────────────

/**
 * Wraps async route handlers so rejected promises are forwarded to Express error middleware.
 * Express 4 doesn't do this automatically.
 */
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Augmented Request ──────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      requestId?: string;
      project?: { id: string; name: string; organizationId: string };
    }
  }
}
