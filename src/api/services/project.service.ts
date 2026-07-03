import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../../shared/db';
import { NotFoundError } from '../../shared/errors';

export class ProjectService {
  /** List projects in an organization */
  async listForOrg(organizationId: string) {
    return prisma.project.findMany({
      where: { organizationId },
      include: {
        _count: { select: { queues: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Create a project within an organization */
  async create(organizationId: string, name: string) {
    // Generate initial API key
    const rawApiKey = `jsk_${randomBytes(32).toString('hex')}`;
    const apiKeyHash = createHash('sha256').update(rawApiKey).digest('hex');

    const project = await prisma.project.create({
      data: {
        organizationId,
        name,
        apiKeyHash,
      },
    });

    // Return the raw key only at creation time — it's hashed in DB
    return {
      ...project,
      apiKey: rawApiKey,
    };
  }

  /** Get project by ID */
  async getById(id: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        queues: {
          include: { _count: { select: { jobs: true } } },
        },
        _count: { select: { queues: true } },
      },
    });

    if (!project) {
      throw new NotFoundError('Project', id);
    }

    return project;
  }

  /** Update project */
  async update(id: string, data: { name?: string }) {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    return prisma.project.update({
      where: { id },
      data,
    });
  }

  /** Delete project (cascades to queues and jobs) */
  async delete(id: string) {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    await prisma.project.delete({ where: { id } });
  }

  /** Rotate API key — generates a new one, invalidating the old */
  async rotateApiKey(id: string) {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    const rawApiKey = `jsk_${randomBytes(32).toString('hex')}`;
    const apiKeyHash = createHash('sha256').update(rawApiKey).digest('hex');

    await prisma.project.update({
      where: { id },
      data: { apiKeyHash },
    });

    return { apiKey: rawApiKey };
  }

  /** Get aggregate metrics for a project */
  async getMetrics(id: string) {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    const queues = await prisma.queue.findMany({
      where: { projectId: id },
      select: { id: true },
    });
    const queueIds = queues.map((q) => q.id);

    if (queueIds.length === 0) {
      return {
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        activeJobs: 0,
        queuedJobs: 0,
        deadLetterJobs: 0,
        successRate: 0,
      };
    }

    const [totalJobs, completedJobs, failedJobs, activeJobs, queuedJobs, deadLetterJobs] =
      await Promise.all([
        prisma.job.count({ where: { queueId: { in: queueIds } } }),
        prisma.job.count({ where: { queueId: { in: queueIds }, status: 'completed' } }),
        prisma.job.count({ where: { queueId: { in: queueIds }, status: 'failed' } }),
        prisma.job.count({
          where: { queueId: { in: queueIds }, status: { in: ['claimed', 'running'] } },
        }),
        prisma.job.count({ where: { queueId: { in: queueIds }, status: 'queued' } }),
        prisma.job.count({ where: { queueId: { in: queueIds }, status: 'dead_letter' } }),
      ]);

    const successRate =
      completedJobs + failedJobs > 0
        ? Math.round((completedJobs / (completedJobs + failedJobs)) * 10000) / 100
        : 0;

    return {
      totalJobs,
      completedJobs,
      failedJobs,
      activeJobs,
      queuedJobs,
      deadLetterJobs,
      successRate,
    };
  }
}

export const projectService = new ProjectService();
