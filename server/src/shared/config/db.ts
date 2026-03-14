// -----------------------------------------------------------------------------
// File: server/src/shared/config/db.ts
// -----------------------------------------------------------------------------

import mongoose from 'mongoose';
import { env }  from './env';

const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES    = 5;

export async function connectDB(retries = MAX_RETRIES): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5_000,
      socketTimeoutMS:          45_000,
    });
    console.log(`[db] Connected → ${sanitise(env.MONGODB_URI)}`);
    mongoose.connection.on('disconnected', () => console.warn('[db] Disconnected'));
    mongoose.connection.on('error', (err: Error) => console.error('[db] Error:', err.message));
  } catch (err) {
    console.error(`[db] Failed: ${err instanceof Error ? err.message : err}`);
    if (retries > 0) {
      console.log(`[db] Retrying in ${RETRY_DELAY_MS / 1000}s… (${retries} left)`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return connectDB(retries - 1);
    }
    console.error('[db] Max retries reached. Exiting.');
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  console.log('[db] Disconnected cleanly');
}

function sanitise(uri: string): string {
  try {
    const u = new URL(uri);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch { return '[invalid uri]'; }
}
