// File: server/src/api/middleware/auth.ts

import type { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../shared/types/user';
import { verifyAccessToken, extractBearer } from '../../shared/utils/jwt';
import { Errors } from '../../shared/utils/response';
import { env } from '../../shared/config/env';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; username: string; role: UserRole };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearer(req.headers['authorization']);
  if (!token) { Errors.unauthorized(res); return; }
  try {
    const p  = verifyAccessToken(token);
    req.user = { userId: p.userId, username: p.username, role: p.role };
    next();
  } catch {
    Errors.unauthorized(res, 'Token is invalid or expired');
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user)                      { Errors.unauthorized(res); return; }
    if (!roles.includes(req.user.role)) { Errors.forbidden(res, `Required role: ${roles.join(' or ')}`); return; }
    next();
  };
}

export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-secret'] !== env.INTERNAL_API_SECRET) {
    Errors.forbidden(res, 'Internal route');
    return;
  }
  next();
}
