import { Router } from 'express';
import { jobService } from '../services/job.service';
import { authenticate, checkProjectAccess } from '../middleware/auth';
import { asyncHandler, success } from '../../shared/types';

export const jobsRouter = Router();

jobsRouter.use(authenticate);
jobsRouter.use(checkProjectAccess);

// GET /api/v1/jobs/:id — full job detail with executions + logs
jobsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const job = await jobService.getById(req.params.id);
    res.json(success(job));
  })
);

// POST /api/v1/jobs/:id/cancel
jobsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const job = await jobService.cancel(req.params.id);
    res.json(success(job));
  })
);

// POST /api/v1/jobs/:id/retry
jobsRouter.post(
  '/:id/retry',
  asyncHandler(async (req, res) => {
    const job = await jobService.retry(req.params.id);
    res.json(success(job));
  })
);
