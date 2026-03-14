// File: server/src/index.ts

import { connectDB }        from './shared/config/db';
import { env }              from './shared/config/env';
import { createApiApp }     from './api/app';
import { createGameServer } from './game/server';

async function main(): Promise<void> {
  console.log('[server] Starting CueMaster...');

  await connectDB();

  const apiApp    = createApiApp();
  const apiServer = apiApp.listen(env.API_PORT, () => {
    console.log(`[api]  http://localhost:${env.API_PORT}`);
    console.log(`[api]  health → http://localhost:${env.API_PORT}/api/health`);
  });

  const gameServer = await createGameServer();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[server] ${signal} received — shutting down`);
    apiServer.close();
    await gameServer.gracefullyShutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
