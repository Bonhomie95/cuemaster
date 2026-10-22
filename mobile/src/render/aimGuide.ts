import { H, W, R, type Ball } from "../physics/engine";

/** First contact for the visual guide, shared by the 3D and compatibility views. */
export function aimGuide(balls: readonly Ball[], angle: number) {
  const cue = balls.find((ball) => ball.id === 0);
  let distance = 2.7;
  let hit: Ball | undefined;
  if (!cue || cue.pocketed) return { distance: 0, hit };
  const dx = Math.cos(angle),
    dz = Math.sin(angle);
  for (const ball of balls) {
    if (ball.id === 0 || ball.pocketed) continue;
    const x = ball.x - cue.x,
      z = ball.z - cue.z;
    const along = x * dx + z * dz;
    const perpendicularSquared = x * x + z * z - along * along;
    if (along <= 0 || perpendicularSquared >= 4 * R * R) continue;
    const contact = along - Math.sqrt(4 * R * R - perpendicularSquared);
    if (contact >= 0 && contact < distance) {
      distance = contact;
      hit = ball;
    }
  }
  const limits = [
    dx > 0 ? (H - R - cue.x) / dx : dx < 0 ? (-H + R - cue.x) / dx : Infinity,
    dz > 0 ? (W - R - cue.z) / dz : dz < 0 ? (-W + R - cue.z) / dz : Infinity,
  ];
  const edge = Math.min(...limits.filter((value) => value >= 0));
  if (edge < distance) {
    distance = edge;
    hit = undefined;
  }
  return { distance, hit };
}
