// File: server/src/shared/physics/ball.ts

import { PhysicsBall } from './types';
import { vec2 }        from './vector';
import {
  BALL_RADIUS,
  ROLLING_FRICTION,
  SLIDING_FRICTION,
  VELOCITY_DEAD_ZONE,
  PHYSICS_TICK_HZ,
} from '../constants';

const DT = 1 / PHYSICS_TICK_HZ;   // seconds per tick

// Gravity constant used for friction force (mm/s²)
const G = 9_810; // mm/s²

const ROLL_FRICTION_DECEL  = ROLLING_FRICTION  * G;  // mm/s²
const SLIDE_FRICTION_DECEL = SLIDING_FRICTION  * G;

/** Angular velocity threshold to consider spin negligible */
const SPIN_DEAD_ZONE = 0.05; // rad/s

/**
 * Advance one ball's state by one tick.
 * Handles sliding → rolling transition and spin decay.
 */
export function stepBall(ball: PhysicsBall): void {
  if (ball.isPocketed) return;

  const speed = vec2.len(ball.vel);
  if (speed < VELOCITY_DEAD_ZONE && !hasSpin(ball)) {
    ball.vel      = vec2.zero();
    ball.spin     = { x: 0, y: 0, z: 0 };
    ball.isMoving  = false;
    ball.isRolling = false;
    return;
  }

  ball.isMoving = true;

  if (ball.isRolling) {
    stepRolling(ball, speed);
  } else {
    stepSliding(ball, speed);
  }
}

/** Rolling: only rolling friction, spin.z tracks velocity direction */
function stepRolling(ball: PhysicsBall, speed: number): void {
  const decel = ROLL_FRICTION_DECEL * DT;

  if (speed <= decel) {
    ball.vel      = vec2.zero();
    ball.spin     = { x: 0, y: 0, z: 0 };
    ball.isMoving  = false;
    ball.isRolling = false;
    return;
  }

  const dir  = vec2.norm(ball.vel);
  const newSpeed = speed - decel;
  ball.vel = vec2.scale(dir, newSpeed);

  // Keep spin.z consistent with rolling constraint
  ball.spin.z = newSpeed / BALL_RADIUS;

  // Topspin / backspin decay as ball rolls out
  ball.spin.x = decaySpin(ball.spin.x, decel / BALL_RADIUS);
  ball.spin.y = decaySpin(ball.spin.y, decel / BALL_RADIUS);

  ball.pos.x += ball.vel.x * DT;
  ball.pos.y += ball.vel.y * DT;
}

/**
 * Sliding: sliding friction, spin and velocity evolve independently.
 * Transitions to rolling when |v - ωr| < threshold.
 */
function stepSliding(ball: PhysicsBall, speed: number): void {
  // Friction opposes velocity direction
  const velDir   = vec2.norm(ball.vel);
  const fDecel   = SLIDE_FRICTION_DECEL * DT;

  // Lateral spin effect: sidespin adds sideways force (english)
  // spin.y (sidespin) pushes the ball perpendicular to travel
  const sideForce = ball.spin.y * BALL_RADIUS * 0.012 * DT;
  const perpDir   = vec2.perp(velDir);

  const newVel = {
    x: ball.vel.x - velDir.x * fDecel + perpDir.x * sideForce,
    y: ball.vel.y - velDir.y * fDecel + perpDir.y * sideForce,
  };

  ball.vel = newVel;

  // Spin decay due to friction
  const spinFriction = (SLIDE_FRICTION_DECEL / BALL_RADIUS) * DT;
  ball.spin.x = decaySpin(ball.spin.x, spinFriction);
  ball.spin.y = decaySpin(ball.spin.y, spinFriction);
  ball.spin.z = decaySpin(ball.spin.z, spinFriction);

  ball.pos.x += ball.vel.x * DT;
  ball.pos.y += ball.vel.y * DT;

  // Check rolling transition:
  // Rolling condition: surface contact velocity ≈ 0
  // v_contact = v - ω × r  (in 2D: vx - spin.z * r, vy)
  const vContactX = ball.vel.x - ball.spin.z * BALL_RADIUS;
  const vContactY = ball.vel.y;
  const contactSpeed = Math.sqrt(vContactX * vContactX + vContactY * vContactY);

  if (contactSpeed < 30) {  // mm/s threshold
    ball.isRolling = true;
    const rollSpeed = vec2.len(ball.vel);
    ball.spin.z = rollSpeed / BALL_RADIUS;
  }
}

function decaySpin(spin: number, amount: number): number {
  if (Math.abs(spin) <= amount) return 0;
  return spin > 0 ? spin - amount : spin + amount;
}

function hasSpin(ball: PhysicsBall): boolean {
  return (
    Math.abs(ball.spin.x) > SPIN_DEAD_ZONE ||
    Math.abs(ball.spin.y) > SPIN_DEAD_ZONE ||
    Math.abs(ball.spin.z) > SPIN_DEAD_ZONE
  );
}
