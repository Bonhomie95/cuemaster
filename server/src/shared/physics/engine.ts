// File: server/src/shared/physics/engine.ts

import { PhysicsBall, ShotResult, ShotFoul, Vec2 } from './types';
import { vec2 }              from './vector';
import { stepBall }          from './ball';
import { resolveBallCollision, resolveCushionCollision } from './collision';
import { getPocketedIndex }  from './pockets';
import {
  BALL_RADIUS,
  MAX_CUE_BALL_SPEED,
  PHYSICS_TICK_HZ,
  VELOCITY_DEAD_ZONE,
  SQUIRT_COEFFICIENT,
} from '../constants';
import type { ShotInput }    from '../types/game';

// NOTE: We accept plain data objects matching BallState schema shape,
// not the Mongoose model. Keep physics pure — no DB imports.
interface BallSnapshot {
  id:         number;
  x:          number;
  y:          number;
  vx:         number;
  vy:         number;
  spin:       { x: number; y: number; z: number };
  isPocketed: boolean;
  isMoving:   boolean;
}

const MAX_TICKS = PHYSICS_TICK_HZ * 30;  // 30-second safety cap

// ── Cue strike ────────────────────────────────────────────────────────────────

/**
 * Convert player input into cue ball initial velocity and spin.
 *
 * Squirt: sidespin deflects the cue ball away from the aim line.
 *   actual_angle = aimAngle + squirt_offset
 *
 * The cue ball receives:
 *   - Linear velocity from aimAngle + power
 *   - Angular velocity (spin) from spinX/spinY
 */
function applyCueStrike(cueBall: PhysicsBall, input: ShotInput): void {
  const speed = input.power * MAX_CUE_BALL_SPEED;

  // Squirt offset from sidespin (deflects cue ball off aim line)
  const squirtAngle = input.spinY * SQUIRT_COEFFICIENT;
  const angle       = input.aimAngle + squirtAngle;

  cueBall.vel = {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed,
  };

  // Spin: x=topspin(+1)/backspin(-1), y=right(+1)/left(-1)
  const MAX_SPIN = speed / BALL_RADIUS;
  cueBall.spin = {
    x: input.spinX * MAX_SPIN * 0.6,   // topspin/backspin
    y: input.spinY * MAX_SPIN * 0.5,   // sidespin (english)
    z: 0,                              // will be set by sliding→rolling transition
  };

  cueBall.isRolling = false;
  cueBall.isMoving  = true;
}

// ── Main simulation ───────────────────────────────────────────────────────────

/**
 * Process a single shot.
 * Takes current ball snapshots + shot input,
 * runs the simulation to completion,
 * returns full result including fouls and pocketed balls.
 */
export function processShot(
  snapshots: BallSnapshot[],
  input:     ShotInput,
): ShotResult {
  // Clone snapshots into mutable PhysicsBall objects
  const balls: PhysicsBall[] = snapshots.map(s => ({
    id:         s.id,
    pos:        { x: s.x, y: s.y },
    vel:        { x: s.vx, y: s.vy },
    spin:       { ...s.spin },
    isPocketed: s.isPocketed,
    isMoving:   s.isMoving,
    isRolling:  false,
  }));

  const cue = balls.find(b => b.id === 0);
  if (!cue || cue.isPocketed) {
    return emptyResult(balls);
  }

  // Apply player's strike
  applyCueStrike(cue, input);

  // Track first contact with an object ball
  let firstContactBallId: number | null = null;
  let contactMade  = false;
  let railHitAfter = false;
  const pocketed: number[] = [];

  let ticks = 0;

  while (ticks < MAX_TICKS) {
    ticks++;

    // 1. Step every ball
    for (const ball of balls) {
      if (!ball.isPocketed) stepBall(ball);
    }

    // 2. Ball-ball collisions (all pairs)
    const active = balls.filter(b => !b.isPocketed);
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]!;
        const b = active[j]!;
        const hit = resolveBallCollision(a, b);
        if (hit && !contactMade && (a.id === 0 || b.id === 0)) {
          const otherId = a.id === 0 ? b.id : a.id;
          firstContactBallId = otherId;
          contactMade = true;
        }
      }
    }

    // 3. Cushion collisions
    for (const ball of active) {
      const side = resolveCushionCollision(ball);
      if (side !== null && contactMade) {
        railHitAfter = true;
      }
    }

    // 4. Pocket detection
    for (const ball of active) {
      if (getPocketedIndex(ball) >= 0) {
        ball.isPocketed = true;
        ball.vel        = vec2.zero();
        ball.spin       = { x: 0, y: 0, z: 0 };
        ball.isMoving   = false;
        if (!pocketed.includes(ball.id)) pocketed.push(ball.id);
      }
    }

    // 5. Stop when nothing is moving
    if (!balls.some(b => b.isMoving && !b.isPocketed)) break;
  }

  // ── Foul detection ─────────────────────────────────────────────────────────
  let foul: ShotFoul | null = null;

  if (pocketed.includes(0)) {
    foul = { type: 'scratch' };
  } else if (!contactMade) {
    foul = { type: 'no_contact' };
  } else if (!railHitAfter && pocketed.filter(id => id !== 0).length === 0) {
    // Nothing pocketed AND no rail contacted after the hit — foul in 8-ball
    foul = { type: 'no_rail_after' };
  }

  return { balls, pocketed, foul, contactMade, railHit: railHitAfter, ticks };
}

function emptyResult(balls: PhysicsBall[]): ShotResult {
  return { balls, pocketed: [], foul: { type: 'no_contact' }, contactMade: false, railHit: false, ticks: 0 };
}

// ── Helpers for MatchRoom ─────────────────────────────────────────────────────

/**
 * Convert Colyseus ArraySchema balls into plain snapshots for physics.
 * Call this inside MatchRoom before processShot().
 */
export function snapshotBalls(schemaBalls: Iterable<{ id: number; x: number; y: number; vx: number; vy: number; spin: { x: number; y: number; z: number }; isPocketed: boolean; isMoving: boolean }>): BallSnapshot[] {
  return Array.from(schemaBalls).map(b => ({
    id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
    spin: { x: b.spin.x, y: b.spin.y, z: b.spin.z },
    isPocketed: b.isPocketed, isMoving: b.isMoving,
  }));
}

/**
 * Write physics result back into the Colyseus schema balls.
 * Call this after processShot() inside MatchRoom.
 */
export function applyResultToBalls(
  result:      ShotResult,
  schemaBalls: { id: number; x: number; y: number; vx: number; vy: number; spin: { x: number; y: number; z: number }; isPocketed: boolean; isMoving: boolean }[],
): void {
  for (const pb of result.balls) {
    const sb = schemaBalls.find(b => b.id === pb.id);
    if (!sb) continue;
    sb.x          = pb.pos.x;
    sb.y          = pb.pos.y;
    sb.vx         = pb.vel.x;
    sb.vy         = pb.vel.y;
    sb.spin.x     = pb.spin.x;
    sb.spin.y     = pb.spin.y;
    sb.spin.z     = pb.spin.z;
    sb.isPocketed = pb.isPocketed;
    sb.isMoving   = pb.isMoving;
  }
}
