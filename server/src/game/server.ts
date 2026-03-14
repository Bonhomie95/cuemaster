// File: server/src/game/server.ts

import http        from 'http';
import express     from 'express';
import { Server }  from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { env }     from '../shared/config/env';
import { MatchRoom } from './rooms/MatchRoom';

export async function createGameServer(): Promise<Server> {
  const app        = express();
  const httpServer = http.createServer(app);

  if (env.COLYSEUS_MONITOR_ENABLED) {
    app.use('/colyseus', monitor());
  }

  const gameServer = new Server({ server: httpServer });
  gameServer.define('match',            MatchRoom, { isRanked: true,  isTournament: false });
  gameServer.define('match_tournament', MatchRoom, { isRanked: true,  isTournament: true  });
  gameServer.define('practice',         MatchRoom, { isRanked: false, isTournament: false });

  await gameServer.listen(env.GAME_PORT);
  console.log(`[game] ws://localhost:${env.GAME_PORT}`);
  if (env.COLYSEUS_MONITOR_ENABLED) {
    console.log(`[game] monitor → http://localhost:${env.GAME_PORT}/colyseus`);
  }

  return gameServer;
}
