import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { verifyAccessToken } from '../../shared/jwt';
import { UnauthorizedError, ForbiddenError } from '../../shared/errors';
import prisma from '../../shared/db';

/**
 * Authentication middleware.
 * Extracts Bearer token or API key, verifies it, and attaches info to the request.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  let apiKey: string | undefined;

  if (typeof apiKeyHeader === 'string') {
    apiKey = apiKeyHeader;
  } else if (authHeader?.startsWith('Bearer jsk_')) {
    apiKey = authHeader.substring(7);
  }

  try {
    if (apiKey) {
      const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
      const project = await prisma.project.findFirst({
        where: { apiKeyHash },
        select: { id: true, name: true, organizationId: true },
      });

      if (!project) {
        throw new UnauthorizedError('Invalid API key');
      }

      req.project = project;
      // Satisfy user check for simple RBAC/controllers
      req.user = {
        userId: 'system',
        email: `system-${project.id}@project.local`,
        role: 'member',
      };
      return next();
    }

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    next(error instanceof UnauthorizedError ? error : new UnauthorizedError('Invalid or expired token'));
  }
}

/**
 * Role-based access control middleware.
 * Must be used after authenticate().
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Requires one of roles: ${roles.join(', ')}`);
    }
    next();
  };
}

/**
 * Middleware to enforce project boundaries for API keys.
 * Verifies that the queue or project accessed belongs to the authenticated project.
 */
export async function checkProjectAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.project) {
      const { projectId, id } = req.params;

      if (projectId && projectId !== req.project.id) {
        throw new ForbiddenError('Access to this project is forbidden');
      }

      if (id) {
        // If the route belongs to the /jobs base path, treat :id as jobId
        const isJobRoute = req.baseUrl.endsWith('/jobs') || req.path.includes('/jobs/');
        const isDlqRoute = req.baseUrl.endsWith('/dlq') || req.path.includes('/dlq/');

        if (isJobRoute) {
          const job = await prisma.job.findUnique({
            where: { id },
            select: { queue: { select: { projectId: true } } },
          });
          if (!job || job.queue.projectId !== req.project.id) {
            throw new ForbiddenError('Access to this job is forbidden');
          }
        } else if (isDlqRoute) {
          const dlq = await prisma.deadLetterEntry.findUnique({
            where: { id },
            select: { queue: { select: { projectId: true } } },
          });
          if (!dlq || dlq.queue.projectId !== req.project.id) {
            throw new ForbiddenError('Access to this DLQ entry is forbidden');
          }
        } else {
          const queue = await prisma.queue.findUnique({
            where: { id },
            select: { projectId: true },
          });
          if (!queue || queue.projectId !== req.project.id) {
            throw new ForbiddenError('Access to this queue is forbidden');
          }
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

