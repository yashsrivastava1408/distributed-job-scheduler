import { Router } from 'express';
import { z } from 'zod';
import { projectService } from '../services/project.service';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler, success } from '../../shared/types';

export const projectsRouter = Router();

projectsRouter.use(authenticate);

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// GET /api/v1/projects/:id
projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await projectService.getById(req.params.id);
    res.json(success(project));
  })
);

// PATCH /api/v1/projects/:id
projectsRouter.patch(
  '/:id',
  validate(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await projectService.update(req.params.id, req.body);
    res.json(success(project));
  })
);

// DELETE /api/v1/projects/:id
projectsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await projectService.delete(req.params.id);
    res.status(204).send();
  })
);

// POST /api/v1/projects/:id/api-keys
projectsRouter.post(
  '/:id/api-keys',
  asyncHandler(async (req, res) => {
    const result = await projectService.rotateApiKey(req.params.id);
    res.status(201).json(success(result));
  })
);

// GET /api/v1/projects/:id/metrics
projectsRouter.get(
  '/:id/metrics',
  asyncHandler(async (req, res) => {
    const metrics = await projectService.getMetrics(req.params.id);
    res.json(success(metrics));
  })
);
