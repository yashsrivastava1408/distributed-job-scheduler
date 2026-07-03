import { Router } from 'express';
import { z } from 'zod';
import { organizationService } from '../services/organization.service';
import { projectService } from '../services/project.service';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler, success } from '../../shared/types';

export const organizationsRouter = Router();

// All routes require authentication
organizationsRouter.use(authenticate);

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
});

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
});

// GET /api/v1/organizations
organizationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const orgs = await organizationService.listForUser(req.user!.userId);
    res.json(success(orgs));
  })
);

// POST /api/v1/organizations
organizationsRouter.post(
  '/',
  validate(createOrgSchema),
  asyncHandler(async (req, res) => {
    const org = await organizationService.create(
      req.body.name,
      req.user!.userId
    );
    res.status(201).json(success(org));
  })
);

// GET /api/v1/organizations/:id
organizationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const org = await organizationService.getById(
      req.params.id,
      req.user!.userId
    );
    res.json(success(org));
  })
);

// GET /api/v1/organizations/:id/projects
organizationsRouter.get(
  '/:id/projects',
  asyncHandler(async (req, res) => {
    // Validate membership first
    await organizationService.getById(req.params.id, req.user!.userId);
    const projects = await projectService.listForOrg(req.params.id);
    res.json(success(projects));
  })
);

// POST /api/v1/organizations/:id/projects
organizationsRouter.post(
  '/:id/projects',
  validate(createProjectSchema),
  asyncHandler(async (req, res) => {
    // Validate membership first
    await organizationService.getById(req.params.id, req.user!.userId);
    const project = await projectService.create(req.params.id, req.body.name);
    res.status(201).json(success(project));
  })
);
