import { DROP, H, W, R } from "../physics/engine";

/**
 * Each pocket's black opening: a disc in ball radii (so it follows the ball size and the rail
 * cut), and the half-plane n·p ≥ d where engine.capture drops a ball. The black is cut at that
 * line, so a ball drawn over black has gone in and one still on the lip sits on cloth.
 */
export type Pocket = {
  x: number;
  z: number;
  r: number;
  nx: number;
  nz: number;
  d: number;
};
const corner = (sx: number, sz: number): Pocket => ({
  x: sx * (H + 0.35 * R),
  z: sz * (W + 0.35 * R),
  r: 2.35 * R,
  nx: sx * Math.SQRT1_2,
  nz: sz * Math.SQRT1_2,
  d: (H + W - DROP.corner * R) * Math.SQRT1_2,
});
const side = (sz: number): Pocket => ({
  x: 0,
  z: sz * (W + 0.6 * R),
  r: 1.95 * R,
  nx: 0,
  nz: sz,
  d: W + DROP.side * R,
});
export const pockets: Pocket[] = [
  corner(1, 1),
  corner(1, -1),
  corner(-1, 1),
  corner(-1, -1),
  side(1),
  side(-1),
];
/** The point on the drop line straight in from the pocket centre: where the lip is. */
export function lip(p: Pocket): [number, number] {
  const k = p.d - (p.nx * p.x + p.nz * p.z);
  return [p.x + k * p.nx, p.z + k * p.nz];
}
/** The opening's outline round the pocket centre: the disc, clipped at the drop line. */
export function opening(p: Pocket, steps = 48): [number, number][] {
  const out: [number, number][] = [];
  const at = (i: number) => {
    const a = (i / steps) * 2 * Math.PI;
    return [p.r * Math.cos(a), p.r * Math.sin(a)] as const;
  };
  const past = (u: number, v: number) =>
    p.nx * (p.x + u) + p.nz * (p.z + v) - p.d;
  for (let i = 0; i < steps; i++) {
    const [u0, v0] = at(i),
      [u1, v1] = at(i + 1),
      a = past(u0, v0),
      b = past(u1, v1);
    if (a >= 0) out.push([u0, v0]);
    if (a >= 0 !== b >= 0) {
      const t = a / (a - b);
      out.push([u0 + t * (u1 - u0), v0 + t * (v1 - v0)]);
    }
  }
  return out;
}
