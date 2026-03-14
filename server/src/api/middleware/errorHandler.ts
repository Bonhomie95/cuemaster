// File: server/src/api/middleware/errorHandler.ts

import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { env }       from '../../shared/config/env';
import { sendError } from '../../shared/utils/response';

export class ApiException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) { super(message); this.name = 'ApiException'; }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof ApiException) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }
  if (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'ValidationError') {
    const details = Object.values((err as { errors: Record<string, { message: string }> }).errors).map(e => e.message);
    sendError(res, 400, 'VALIDATION_ERROR', 'Validation failed', details);
    return;
  }
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    const field = Object.keys((err as { keyPattern?: Record<string, number> }).keyPattern ?? {})[0] ?? 'Field';
    sendError(res, 409, 'CONFLICT', `${field} is already taken`);
    return;
  }
  console.error('[errorHandler]', err);
  const msg = err instanceof Error ? err.message : 'Unexpected error';
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong', env.IS_DEV ? msg : undefined);
};
