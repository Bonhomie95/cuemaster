// File: server/src/shared/physics/collision.ts

import { PhysicsBall } from './types';
import { vec2 }        from './vector';
import {
  BALL_RADIUS,
  BALL_RESTITUTION,
  CUSHION_RESTITUTION,
  THROW_COEFFICIENT,
  SQUIRT_COEFFICIENT,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  CUSHION_THICKNESS,
} from '../constants';

const DIAMETER      = BALL_RADIUS * 2;
const DIAMETER_SQ   = DIAMETER * DIAMETER;

// Play area bounds (inside cushions)
const MIN_X = CUSHION_THICKNESS + BALL_RADIUS;
const MAX_X = TABLE_WIDTH  - CUSHION_THICKNESS - BALL_RADIUS;
const MIN_Y = CUSHION_THICKNESS + BALL_RADIUS;
const MAX_Y = TABLE_HEIGHT - CUSHION_THICKNESS - BALL_RADIUS;

// ── Ball-ball collision ────────────────────────────────────────────────────────

/**
 * Check and resolve collision between two balls.
 * Returns true if a collision occurred.
 * Implements:
 *   - Elastic collision (equal mass)
 *   - Throw: sidespin on cue ball deflects the object ball
 *   - Cut-induced throw (friction between balls at contact)
 */
export function resolveBallCollision(a: PhysicsBall, b: PhysicsBall): boolean {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const dist2 = dx * dx + dy * dy;

  if (dist2 >= DIAMETER_SQ || dist2 === 0) return false;

  const dist = Math.sqrt(dist2);
  const nx = dx / dist;   // normal pointing from a → b
  const ny = dy / dist;

  // Separate overlapping balls
  const overlap = (DIAMETER - dist) / 2;
  a.pos.x -= nx * overlap;
  a.pos.y -= ny * overlap;
  b.pos.x += nx * overlap;
  b.pos.y += ny * overlap;

  // Relative velocity along normal
  const dvx = b.vel.x - a.vel.x;
  const dvy = b.vel.y - a.vel.y;
  const dvn  = dvx * nx + dvy * ny;

  // Only resolve if approaching
  if (dvn > 0) return true;

  // Elastic impulse (equal mass, coefficient of restitution)
  const impulse = -(1 + BALL_RESTITUTION) * dvn / 2;

  a.vel.x -= impulse * nx;
  a.vel.y -= impulse * ny;
  b.vel.x += impulse * nx;
  b.vel.y += impulse * ny;

  // ── Throw effect ─────────────────────────────────────────────────────────
  // Tangential component of contact — friction between balls deflects object
  const tx = -ny;   // tangent perpendicular to normal
  const ty =  nx;

  // Cue ball sidespin contribution (english throw)
  const spinThrow = a.spin.y * SQUIRT_COEFFICIENT;

  // Cut angle throw (friction)
  const aSpdTan = a.vel.x * tx + a.vel.y * ty;
  const cutThrow = aSpdTan * THROW_COEFFICIENT;

  const totalThrow = (spinThrow + cutThrow) * 0.5;

  b.vel.x += tx * totalThrow;
  b.vel.y += ty * totalThrow;

  // Reset cue ball to rolling after contact (spin partially transferred)
  a.spin.x *= 0.5;
  a.spin.y *= 0.5;
  a.isRolling = false;
  b.isRolling = false;
  b.isMoving  = true;

  return true;
}

// ── Cushion (rail) collision ───────────────────────────────────────────────────

export type CushionSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * Check and resolve a ball bouncing off a cushion rail.
 * Returns which side was hit, or null.
 * Cushion throw: sidespin causes slight sideways bounce deviation.
 */
export function resolveCushionCollision(ball: PhysicsBall): CushionSide | null {
  let side: CushionSide | null = null;

  // Left rail
  if (ball.pos.x < MIN_X) {
    ball.pos.x    = MIN_X;
    ball.vel.x    = Math.abs(ball.vel.x) * CUSHION_RESTITUTION;
    // Sidespin off rail reverses sidespin component
    const throwY  = ball.spin.y * 0.08;
    ball.vel.y   += throwY;
    ball.spin.y  *= -0.7;
    ball.spin.z  *= CUSHION_RESTITUTION;
    ball.isRolling = false;
    side = 'left';
  }

  // Right rail
  if (ball.pos.x > MAX_X) {
    ball.pos.x    = MAX_X;
    ball.vel.x    = -Math.abs(ball.vel.x) * CUSHION_RESTITUTION;
    const throwY  = ball.spin.y * 0.08;
    ball.vel.y   += throwY;
    ball.spin.y  *= -0.7;
    ball.spin.z  *= CUSHION_RESTITUTION;
    ball.isRolling = false;
    side = 'right';
  }

  // Top rail
  if (ball.pos.y < MIN_Y) {
    ball.pos.y    = MIN_Y;
    ball.vel.y    = Math.abs(ball.vel.y) * CUSHION_RESTITUTION;
    const throwX  = ball.spin.y * 0.08;
    ball.vel.x   += throwX;
    ball.spin.x  *= -0.7;
    ball.spin.z  *= CUSHION_RESTITUTION;
    ball.isRolling = false;
    side = 'top';
  }

  // Bottom rail
  if (ball.pos.y > MAX_Y) {
    ball.pos.y    = MAX_Y;
    ball.vel.y    = -Math.abs(ball.vel.y) * CUSHION_RESTITUTION;
    const throwX  = ball.spin.y * 0.08;
    ball.vel.x   += throwX;
    ball.spin.x  *= -0.7;
    ball.spin.z  *= CUSHION_RESTITUTION;
    ball.isRolling = false;
    side = 'bottom';
  }

  return side;
}
