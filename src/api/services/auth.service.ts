import bcrypt from 'bcryptjs';
import prisma from '../../shared/db';
import {
  generateTokenPair,
  verifyRefreshToken,
  TokenPayload,
} from '../../shared/jwt';
import { ConflictError, UnauthorizedError } from '../../shared/errors';

function toTokenPayload(user: { id: string; email: string; role: string }): TokenPayload {
  return { userId: user.id, email: user.email, role: user.role };
}

function sanitizeUser(user: { id: string; email: string; name: string; role: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export class AuthService {
  async register(email: string, password: string, name: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    });

    const tokens = generateTokenPair(toTokenPayload(user));

    return {
      user: sanitizeUser(user),
      ...tokens,
    };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokens = generateTokenPair(toTokenPayload(user));

    return {
      user: sanitizeUser(user),
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      return generateTokenPair(toTokenPayload(user));
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid refresh token');
    }
  }
}

export const authService = new AuthService();
