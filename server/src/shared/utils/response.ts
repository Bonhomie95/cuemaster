// -----------------------------------------------------------------------------
// File: server/src/shared/utils/response.ts
// -----------------------------------------------------------------------------

import type { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
  res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined && { details }) },
  });
}

export const Errors = {
  badRequest:   (res: Response, msg: string, details?: unknown) => sendError(res, 400, 'BAD_REQUEST',    msg, details),
  unauthorized: (res: Response, msg = 'Authentication required') => sendError(res, 401, 'UNAUTHORIZED',   msg),
  forbidden:    (res: Response, msg = 'Access denied')           => sendError(res, 403, 'FORBIDDEN',      msg),
  notFound:     (res: Response, resource = 'Resource')           => sendError(res, 404, 'NOT_FOUND',      `${resource} not found`),
  conflict:     (res: Response, msg: string)                     => sendError(res, 409, 'CONFLICT',       msg),
  internal:     (res: Response, msg = 'Internal server error')   => sendError(res, 500, 'INTERNAL_ERROR', msg),
} as const;
