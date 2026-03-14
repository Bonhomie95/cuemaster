// -----------------------------------------------------------------------------
// File: server/src/shared/types/game.ts
// -----------------------------------------------------------------------------

export enum GameMode {
  EIGHT_BALL = '8ball',
  NINE_BALL  = '9ball',
}

export enum MatchStatus {
  WAITING     = 'waiting',
  COUNTDOWN   = 'countdown',
  IN_PROGRESS = 'in_progress',
  PAUSED      = 'paused',
  FINISHED    = 'finished',
  ABANDONED   = 'abandoned',
}

export enum TurnPhase {
  AIMING       = 'aiming',
  SHOT_PENDING = 'shot_pending',
  RESOLVING    = 'resolving',
  FOUL_CALLED  = 'foul_called',
  BALL_IN_HAND = 'ball_in_hand',
}

export interface ShotInput {
  aimAngle:        number;   // radians
  power:           number;   // 0.0 – 1.0
  spinX:           number;   // -1.0 – 1.0
  spinY:           number;   // -1.0 – 1.0
  cueBallX?:       number;
  cueBallY?:       number;
  clientTimestamp: number;
}

export interface MatchResult {
  matchId:   string;
  winnerId:  string;
  loserId:   string;
  winReason: string;
  shotCount: number;
  durationMs: number;
}
