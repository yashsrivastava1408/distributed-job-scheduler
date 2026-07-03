import { Router } from 'express';
import { z } from 'zod';
import { queueService } from '../services/queue.service';
import { jobService } from '../services/job.service';
import { schedulerService } from '../services/scheduler.service';
import { authenticate, checkProjectAccess } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler, success, paginated, parsePagination } from '../../shared/types';

export const queuesRouter = Router();

queuesRouter.use(authenticate);
queuesRouter.use(checkProjectAccess);

const createQueueSchema = z.object({
  name: z.string().min(1).max(100),
  priority: z.number().int().min(0).max(100).optional(),
  maxConcurrency: z.number().int().min(1).max(1000).optional(),
  retryPolicy: z
    .object({
      strategy: z.enum(['fixed', 'linear', 'exponential']),
      baseDelayMs: z.number().int().min(100).max(3600000),
      maxDelayMs: z.number().int().min(100).max(86400000),
      maxAttempts: z.number().int().min(1).max(100),
      jitter: z.boolean().optional(),
    })
    .optional(),
});

const updateQueueSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  maxConcurrency: z.number().int().min(1).max(1000).optional(),
});

const createJobSchema = z.object({
  type: z.string().min(1).max(200),
  payload: z.record(z.unknown()).optional(),
  priority: z.number().int().optional(),
  runAt: z.string().datetime().optional(),
  idempotencyKey: z.string().max(255).optional(),
  maxAttempts: z.number().int().min(1).max(100).optional(),
});

const createBatchSchema = z.object({
  label: z.string().max(200).optional(),
  jobs: z
    .array(
      z.object({
        type: z.string().min(1).max(200),
        payload: z.record(z.unknown()).optional(),
        priority: z.number().int().optional(),
        runAt: z.string().datetime().optional(),
      })
    )
    .min(1)
    .max(1000),
});

const createScheduledJobSchema = z.object({
  type: z.string().min(1).max(200),
  payload: z.record(z.unknown()).optional(),
  scheduleType: z.enum(['once', 'cron']),
  cronExpression: z.string().optional(),
  runAt: z.string().datetime().optional(),
  maxAttempts: z.number().int().min(1).max(100).optional(),
});

// ─── Queue CRUD ─────────────────────────────────────────────────────

// GET /api/v1/queues/project/:projectId — list queues for a project
queuesRouter.get(
  '/project/:projectId',
  asyncHandler(async (req, res) => {
    const queues = await queueService.listForProject(req.params.projectId);
    res.json(success(queues));
  })
);

// POST /api/v1/queues/project/:projectId — create queue in project
queuesRouter.post(
  '/project/:projectId',
  validate(createQueueSchema),
  asyncHandler(async (req, res) => {
    const queue = await queueService.create(req.params.projectId, req.body);
    res.status(201).json(success(queue));
  })
);

// GET /api/v1/queues/:id
queuesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const queue = await queueService.getById(req.params.id);
    res.json(success(queue));
  })
);

// PATCH /api/v1/queues/:id
queuesRouter.patch(
  '/:id',
  validate(updateQueueSchema),
  asyncHandler(async (req, res) => {
    const queue = await queueService.update(req.params.id, req.body);
    res.json(success(queue));
  })
);

// DELETE /api/v1/queues/:id
queuesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await queueService.delete(req.params.id);
    res.status(204).send();
  })
);

// POST /api/v1/queues/:id/pause
queuesRouter.post(
  '/:id/pause',
  asyncHandler(async (req, res) => {
    const queue = await queueService.pause(req.params.id);
    res.json(success(queue));
  })
);

// POST /api/v1/queues/:id/resume
queuesRouter.post(
  '/:id/resume',
  asyncHandler(async (req, res) => {
    const queue = await queueService.resume(req.params.id);
    res.json(success(queue));
  })
);

// GET /api/v1/queues/:id/stats
queuesRouter.get(
  '/:id/stats',
  asyncHandler(async (req, res) => {
    const stats = await queueService.getStats(req.params.id);
    res.json(success(stats));
  })
);

// ─── Job Endpoints (nested under queues) ────────────────────────────

// POST /api/v1/queues/:id/jobs — create a single job
queuesRouter.post(
  '/:id/jobs',
  validate(createJobSchema),
  asyncHandler(async (req, res) => {
    await queueService.assertAcceptingJobs(req.params.id);
    const result = await jobService.create(req.params.id, req.body);
    res.status(result.created ? 201 : 200).json(success(result.job));
  })
);

// POST /api/v1/queues/:id/jobs/batch — create batch of jobs
queuesRouter.post(
  '/:id/jobs/batch',
  validate(createBatchSchema),
  asyncHandler(async (req, res) => {
    await queueService.assertAcceptingJobs(req.params.id);
    const result = await jobService.createBatch(req.params.id, req.body);
    res.status(201).json(success(result));
  })
);

// POST /api/v1/queues/:id/scheduled-jobs — create scheduled/cron job
queuesRouter.post(
  '/:id/scheduled-jobs',
  validate(createScheduledJobSchema),
  asyncHandler(async (req, res) => {
    const scheduled = await schedulerService.createScheduledJob(
      req.params.id,
      req.body
    );
    res.status(201).json(success(scheduled));
  })
);

// GET /api/v1/queues/:id/jobs — list jobs with filters
queuesRouter.get(
  '/:id/jobs',
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const filters = {
      status: req.query.status as string | undefined,
      type: req.query.type as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const { jobs, total } = await jobService.listForQueue(
      req.params.id,
      pagination,
      filters
    );
    res.json(paginated(jobs, total, pagination.page, pagination.limit));
  })
);

// GET /api/v1/queues/:id/dlq — list dead letter entries
queuesRouter.get(
  '/:id/dlq',
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const { entries, total } = await jobService.getDlqEntries(
      req.params.id,
      pagination
    );
    res.json(paginated(entries, total, pagination.page, pagination.limit));
  })
);
