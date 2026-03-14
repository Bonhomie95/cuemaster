// -----------------------------------------------------------------------------
// File: server/src/shared/constants/index.ts
// -----------------------------------------------------------------------------

// ── Table (WPA 9-foot, millimetres) ───────────────────────────────────────────
export const TABLE_WIDTH  = 2540;
export const TABLE_HEIGHT = 1270;
export const CUSHION_THICKNESS    = 50;
export const CORNER_POCKET_RADIUS = 57;
export const SIDE_POCKET_RADIUS   = 65;

// ── Ball ──────────────────────────────────────────────────────────────────────
export const BALL_RADIUS  = 28.575 / 2;
export const BALL_MASS_KG = 0.170;

// ── Physics ───────────────────────────────────────────────────────────────────
export const ROLLING_FRICTION    = 0.012;
export const SLIDING_FRICTION    = 0.20;
export const CUSHION_RESTITUTION = 0.75;
export const BALL_RESTITUTION    = 0.95;
export const SQUIRT_COEFFICIENT  = 0.028;
export const THROW_COEFFICIENT   = 0.015;
export const VELOCITY_DEAD_ZONE  = 2.0;
export const MAX_CUE_BALL_SPEED  = 7_500;
export const PHYSICS_TICK_HZ     = 120;

// ── Rack ──────────────────────────────────────────────────────────────────────
export const FOOT_SPOT_X   = TABLE_WIDTH  * 0.75;
export const FOOT_SPOT_Y   = TABLE_HEIGHT * 0.5;
export const HEAD_STRING_X = TABLE_WIDTH  * 0.25;

// ── Timing ────────────────────────────────────────────────────────────────────
export const TURN_TIME_SECONDS          = 45;
export const DISCONNECT_GRACE_SECONDS   = 30;
export const COUNTDOWN_SECONDS          = 3;
export const SHOT_RESOLUTION_TIMEOUT_MS = 10_000;

// ── ELO ───────────────────────────────────────────────────────────────────────
export const ELO_DEFAULT           = 1000;
export const ELO_K_FACTOR          = 32;
export const ELO_K_PROVISIONAL     = 48;
export const ELO_PROVISIONAL_GAMES = 30;

export const ELO_TIER_THRESHOLDS: Record<string, [number, number]> = {
  beginner: [0,    899],
  amateur:  [900,  1099],
  skilled:  [1100, 1299],
  expert:   [1300, 1499],
  master:   [1500, 1699],
  diamond:  [1700, 1899],
  legend:   [1900, 999999],
};

// ── Economy ───────────────────────────────────────────────────────────────────
export const DAILY_BONUS_COINS = 25;
export const WIN_REWARD_COINS  = 10;

// ── Validation ────────────────────────────────────────────────────────────────
export const MAX_USERNAME_LENGTH = 20;
export const MIN_USERNAME_LENGTH = 3;
export const MIN_PASSWORD_LENGTH = 8;
export const MIN_AGE_YEARS       = 18;

// ── Geo-blocked US states ─────────────────────────────────────────────────────
export const GEO_BLOCKED_US_STATES = ['WA', 'MT', 'ND', 'SD'] as const;
