import { Router } from 'express';
import { workerService } from '../services/worker.service';
import { authenticate } from '../middleware/auth';
import { asyncHandler, success } from '../../shared/types';

export const workersRouter = Router();

workersRouter.use(authenticate);

// GET /api/v1/workers — list all workers
workersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const workers = await workerService.list();
    res.json(success(workers));
  })
);

// GET /api/v1/workers/:id — worker detail
workersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const worker = await workerService.getById(req.params.id);
    res.json(success(worker));
  })
);
