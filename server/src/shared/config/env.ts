// -----------------------------------------------------------------------------
// File: server/src/shared/config/env.ts
// -----------------------------------------------------------------------------

import 'dotenv/config';

function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`[env] Missing required variable: ${key}`);
  return v;
}

function opt(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  NODE_ENV: opt('NODE_ENV', 'development'),
  IS_PROD:  process.env['NODE_ENV'] === 'production',
  IS_DEV:   process.env['NODE_ENV'] !== 'production',

  API_PORT:  parseInt(opt('API_PORT',  '4000'), 10),
  GAME_PORT: parseInt(opt('GAME_PORT', '2567'), 10),

  MONGODB_URI: req('MONGODB_URI'),

  JWT_ACCESS_SECRET:      req('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET:     req('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN:  opt('JWT_ACCESS_EXPIRES_IN',  '15m'),
  JWT_REFRESH_EXPIRES_IN: opt('JWT_REFRESH_EXPIRES_IN', '30d'),

  CORS_ORIGINS: opt('CORS_ORIGINS', 'http://localhost:5173')
    .split(',').map(o => o.trim()),

  BCRYPT_ROUNDS:        parseInt(opt('BCRYPT_ROUNDS',        '10'),     10),
  RATE_LIMIT_WINDOW_MS: parseInt(opt('RATE_LIMIT_WINDOW_MS', '900000'), 10),
  RATE_LIMIT_MAX:       parseInt(opt('RATE_LIMIT_MAX',       '100'),    10),

  INTERNAL_API_SECRET:      req('INTERNAL_API_SECRET'),
  COLYSEUS_MONITOR_ENABLED: opt('COLYSEUS_MONITOR_ENABLED', 'true') === 'true',
} as const;
