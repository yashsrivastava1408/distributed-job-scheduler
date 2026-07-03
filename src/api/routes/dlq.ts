import { Router } from 'express';
import { jobService } from '../services/job.service';
import { authenticate, checkProjectAccess } from '../middleware/auth';
import { asyncHandler, success } from '../../shared/types';

export const dlqRouter = Router();

dlqRouter.use(authenticate);
dlqRouter.use(checkProjectAccess);

// POST /api/v1/dlq/:id/requeue — requeue a dead letter entry
dlqRouter.post(
  '/:id/requeue',
  asyncHandler(async (req, res) => {
    const job = await jobService.requeueFromDlq(req.params.id);
    res.json(success(job));
  })
);
