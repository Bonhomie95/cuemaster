import { H, W, R } from "../physics/engine";
/** Lift the butt so the shaft clears the rail, including when the tip is near a pocket jaw. */
export function cueElevation(
  x: number,
  z: number,
  angle: number,
  tipY: number,
) {
  const dx = -Math.cos(angle),
    dz = -Math.sin(angle);
  const distances = [
    dx > 0 ? (H - x) / dx : dx < 0 ? (-H - x) / dx : Infinity,
    dz > 0 ? (W - z) / dz : dz < 0 ? (-W - z) / dz : Infinity,
  ];
  const back = Math.max(
    0.008,
    Math.min(...distances.filter((d) => d >= 0)) - R - 0.018,
  );
  return Math.max(0.035, Math.atan2(Math.max(0, 0.095 - tipY), back));
}
