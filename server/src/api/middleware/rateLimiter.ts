// File: server/src/api/middleware/rateLimiter.ts

import rateLimit from 'express-rate-limit';
import { env } from '../../shared/config/env';

const msg = (m: string) => ({ success: false, error: { code: 'TOO_MANY_REQUESTS', message: m } });

export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX,
  standardHeaders: true, legacyHeaders: false,
  message: msg('Rate limit exceeded. Try again later.'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: msg('Too many attempts. Try again in 15 minutes.'),
});

export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: msg('Registration rate limit exceeded.'),
});
