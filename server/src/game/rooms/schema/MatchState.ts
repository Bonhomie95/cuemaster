// File: server/src/game/rooms/schema/MatchState.ts

import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { BallState } from './BallState';
import { PlayerState } from './PlayerState';
import { MatchStatus, TurnPhase, GameMode } from '../../../shared/types/game';
import { TABLE_WIDTH, TABLE_HEIGHT, HEAD_STRING_X, BALL_RADIUS, TURN_TIME_SECONDS } from '../../../shared/constants';

export class MatchState extends Schema {
  @type('string')  matchId           = '';
  @type('string')  gameMode          = GameMode.EIGHT_BALL;
  @type('string')  status            = MatchStatus.WAITING;
  @type('string')  turnPhase         = TurnPhase.AIMING;
  @type('string')  currentTurn       = '';
  @type('string')  breakPlayerId     = '';
  @type('uint16')  shotCount         = 0;
  @type('boolean') isBallInHand      = false;
  @type('boolean') isBreakShot       = true;
  @type('uint8')   countdown         = 0;
  @type('string')  winnerId          = '';
  @type('string')  winReason         = '';
  @type('uint32')  startedAt         = 0;
  @type('uint32')  finishedAt        = 0;
  @type('boolean') isTournamentMatch = false;

  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([BallState])          balls   = new ArraySchema<BallState>();
}

export function buildInitialMatchState(matchId: string): MatchState {
  const state   = new MatchState();
  state.matchId = matchId;
  for (let i = 0; i <= 15; i++) {
    const b = new BallState();
    b.id = i;
    state.balls.push(b);
  }
  return state;
}

export function rackBalls(state: MatchState): void {
  const footX = TABLE_WIDTH  * 0.75;
  const footY = TABLE_HEIGHT * 0.5;
  const d     = BALL_RADIUS * 2 + 0.5;
  const rowH  = d * Math.sin(Math.PI / 3);

  // Standard 8-ball rack: apex at foot spot, 8-ball in centre
  const rack: number[][] = [
    [1],
    [2, 3],
    [4, 8, 5],
    [6, 14, 13, 7],
    [9, 10, 11, 12, 15],
  ];

  rack.forEach((row, ri) => {
    row.forEach((ballId, ci) => {
      const ball = state.balls.find(b => b.id === ballId);
      if (!ball) return;
      ball.x = footX + ri * rowH;
      ball.y = footY + (ci - (row.length - 1) / 2) * d;
      ball.isPocketed = false;
      ball.isMoving   = false;
    });
  });

  const cue = state.balls.find(b => b.id === 0);
  if (cue) { cue.x = HEAD_STRING_X; cue.y = TABLE_HEIGHT / 2; }
}
