import { Router } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { validate } from '../middleware/validate';
import { asyncHandler, success } from '../../shared/types';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// POST /api/v1/auth/register
authRouter.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(
      req.body.email,
      req.body.password,
      req.body.name
    );
    res.status(201).json(success(result));
  })
);

// POST /api/v1/auth/login
authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body.email, req.body.password);
    res.json(success(result));
  })
);

// POST /api/v1/auth/refresh
authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const tokens = await authService.refresh(req.body.refreshToken);
    res.json(success(tokens));
  })
);
