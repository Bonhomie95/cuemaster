// File: mobile/src/types/game.ts

export type MatchStatus =
  | 'waiting' | 'countdown' | 'in_progress'
  | 'paused'  | 'finished'  | 'abandoned';

export type TurnPhase =
  | 'aiming' | 'shot_pending' | 'resolving'
  | 'foul_called' | 'ball_in_hand';

export type BallGroup = 'solids' | 'stripes' | '';

export interface BallState {
  id:         number;   // 0=cue, 1-7=solids, 8=eight, 9-15=stripes
  x:          number;   // mm
  y:          number;
  vx:         number;
  vy:         number;
  spin:       { x: number; y: number; z: number };
  isPocketed: boolean;
  isMoving:   boolean;
}

export interface PlayerState {
  userId:            string;
  username:          string;
  displayName:       string;
  eloRating:         number;
  isConnected:       boolean;
  isReady:           boolean;
  ballGroup:         BallGroup;
  ballsPocketed:     number[];
  turnTimeRemaining: number;
  totalTimeUsed:     number;
}

export interface MatchState {
  matchId:       string;
  status:        MatchStatus;
  turnPhase:     TurnPhase;
  currentTurn:   string;
  breakPlayerId: string;
  shotCount:     number;
  isBallInHand:  boolean;
  isBreakShot:   boolean;
  countdown:     number;
  winnerId:      string;
  winReason:     string;
  players:       Record<string, PlayerState>;
  balls:         BallState[];
}

export interface ShotInput {
  aimAngle:        number;
  power:           number;
  spinX:           number;
  spinY:           number;
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

// Table layout constants (must match server)
export const TABLE_WIDTH  = 2540;  // mm
export const TABLE_HEIGHT = 1270;  // mm
export const BALL_RADIUS  = 28.575 / 2;

// Ball colours
export const BALL_COLORS: Record<number, string> = {
  0:  '#F5F5DC',  // cue ball — ivory
  1:  '#FFD700',  // 1 solid yellow
  2:  '#1E3A8A',  // 2 solid blue
  3:  '#DC2626',  // 3 solid red
  4:  '#7C3AED',  // 4 solid purple
  5:  '#F97316',  // 5 solid orange
  6:  '#166534',  // 6 solid green
  7:  '#7F1D1D',  // 7 solid maroon
  8:  '#111827',  // 8 ball black
  9:  '#FFD700',  // 9 stripe yellow
  10: '#1E3A8A',  // 10 stripe blue
  11: '#DC2626',  // 11 stripe red
  12: '#7C3AED',  // 12 stripe purple
  13: '#F97316',  // 13 stripe orange
  14: '#166534',  // 14 stripe green
  15: '#7F1D1D',  // 15 stripe maroon
};

export const IS_STRIPE: Record<number, boolean> = {
  9: true, 10: true, 11: true, 12: true, 13: true, 14: true, 15: true,
};
