// File: server/src/api/routes/index.ts

import type { Express, Request, Response } from 'express';
import { authRouter }    from './auth';
import { matchesRouter } from './matches';

export function registerRoutes(app: Express): void {
  app.get('/api/health', (_req: Request, res: Response) =>
    res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } }));

  app.use('/api/auth',    authRouter);
  app.use('/api/users',   authRouter);   // /api/users/me lives on authRouter
  app.use('/api/matches', matchesRouter);

  // Phase 5: app.use('/api/coins',       coinsRouter);
  // Phase 6: app.use('/api/tournaments', tournamentsRouter);
  // Phase 7: app.use('/api/admin',       adminRouter);

  app.use((_req: Request, res: Response) =>
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }));
}
