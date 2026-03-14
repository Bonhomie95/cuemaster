// -----------------------------------------------------------------------------
// File: server/src/shared/utils/jwt.ts
// -----------------------------------------------------------------------------

import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthTokenPayload } from '../types/user';

export function signAccessToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions);
}

export function signRefreshToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthTokenPayload;
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthTokenPayload;
}

export function extractBearer(authHeader?: string): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
}
