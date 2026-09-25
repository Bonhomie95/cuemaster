import { Ball, H, W, R, World } from "../physics/engine";
import { Progress } from "./progress";

export type CpuOpponent = {
  name: string;
  avatar: number;
  skill: number;
  tier: string;
  kind: "cpu";
};
export function cpuSkill(stats: {
  cpuWins?: number;
  cpuLosses?: number;
  cpuStreak?: number;
}) {
  const wins = stats.cpuWins || 0,
    losses = stats.cpuLosses || 0,
    streak = stats.cpuStreak || 0;
  // Smoothed record prevents a single result from swinging difficulty wildly.
  return Math.max(
    0.18,
    Math.min(
      0.92,
      0.48 +
        (wins / (wins + losses + 8) - losses / (wins + losses + 8)) * 0.28 +
        Math.max(-4, Math.min(6, streak)) * 0.055,
    ),
  );
}
export function makeCpu(
  stats: Parameters<typeof cpuSkill>[0],
  seed: number,
): CpuOpponent {
  const names = [
    "Maya",
    "Theo",
    "Amara",
    "Kai",
    "Zara",
    "Luca",
    "Imani",
    "Rio",
  ];
  const skill = cpuSkill(stats),
    i = Math.abs(seed) % names.length;
  return {
    name: names[i],
    avatar: i % 2,
    kind: "cpu",
    skill,
    tier: skill < 0.35 ? "Relaxed" : skill > 0.7 ? "Expert" : "Club",
  };
}
export type CpuShot = {
  angle: number;
  power: number;
  side: number;
  top: number;
};
const pockets = [
  [-H, -W],
  [0, -W - 0.045],
  [H, -W],
  [-H, W],
  [0, W + 0.045],
  [H, W],
];
function clearPath(
  balls: Ball[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  skip: number[],
) {
  const dx = bx - ax,
    dz = bz - az,
    d2 = dx * dx + dz * dz;
  return !balls.some((b) => {
    if (b.pocketed || skip.includes(b.id)) return false;
    const t = Math.max(
      0,
      Math.min(1, ((b.x - ax) * dx + (b.z - az) * dz) / d2),
    );
    return Math.hypot(b.x - ax - t * dx, b.z - az - t * dz) < 2 * R + 0.002;
  });
}
export function planCpuShot(
  balls: Ball[],
  progress: Progress,
  skill: number,
  isBreak: boolean,
  random = Math.random,
): CpuShot {
  const cue = balls.find((b) => b.id === 0)!;
  if (isBreak)
    return {
      angle: Math.atan2(-cue.z, H / 2 - cue.x) + (random() - 0.5) * 0.018,
      power: 0.78 + skill * 0.18,
      side: 0,
      top: 0,
    };
  const legal = balls.filter(
    (b) =>
      b.id &&
      !b.pocketed &&
      !progress.targetWarning(
        b.id,
        false,
        balls.map((b) => b.id),
      ),
  );
  const candidates: { angle: number; power: number; score: number }[] = [];
  for (const b of legal)
    for (const [px, pz] of pockets) {
      const d = Math.hypot(px - b.x, pz - b.z),
        ux = (px - b.x) / d,
        uz = (pz - b.z) / d;
      const gx = b.x - 2 * R * ux,
        gz = b.z - 2 * R * uz;
      if (Math.abs(gx) > H - R || Math.abs(gz) > W - R) continue;
      const travel = Math.hypot(gx - cue.x, gz - cue.z);
      const cut = ((gx - cue.x) * ux + (gz - cue.z) * uz) / travel;
      if (
        cut < 0.25 ||
        !clearPath(balls, cue.x, cue.z, gx, gz, [0, b.id]) ||
        !clearPath(balls, b.x, b.z, px, pz, [0, b.id])
      )
        continue;
      const velocity = Math.sqrt(2 * 0.012 * 9.81 * (d + 0.22)) / 0.7 / cut;
      const v =
        Math.sqrt(velocity * velocity + 2 * 0.012 * 9.81 * travel) / 0.71;
      const power = Math.max(
        0.13,
        Math.min(0.55, ((v - 0.18) / 10.82) ** (1 / 1.45)),
      );
      candidates.push({
        angle: Math.atan2(gz - cue.z, gx - cue.x),
        power,
        score: cut * 3 - travel - d * 0.5,
      });
    }
  candidates.sort((a, b) => b.score - a.score);
  // Only stronger rivals consider the best options; lower skill has more aim/power variation.
  const best =
    candidates[
      Math.min(
        candidates.length - 1,
        Math.floor(random() * (1 - skill) * Math.min(4, candidates.length)),
      )
    ];
  let angle = best?.angle;
  if (angle === undefined) {
    const target =
      legal.find((b) => clearPath(balls, cue.x, cue.z, b.x, b.z, [0, b.id])) ||
      legal[0];
    angle = target ? Math.atan2(target.z - cue.z, target.x - cue.x) : 0;
  }
  return {
    angle: angle + (random() - 0.5) * (0.003 + (1 - skill) ** 2 * 0.11),
    power: Math.max(
      0.1,
      Math.min(
        0.65,
        (best?.power || 0.32) * (1 + (random() - 0.5) * (1 - skill) * 0.5),
      ),
    ),
    side: 0,
    top: 0,
  };
}
export function cpuPlacement(
  balls: Ball[],
  headString: boolean,
): { x: number; z: number } | null {
  const w = new World(balls);
  // Try the open centre first, then a fine grid. Never teleport through another ball or rail.
  for (const x of [-H / 2, -H * 0.75, 0, H * 0.35, -H * 0.9, H * 0.7])
    for (const z of [0, -W * 0.5, W * 0.5, -W * 0.8, W * 0.8]) {
      if (headString && x > -H / 2) continue;
      if (w.placeCue(x, z)) return { x, z };
    }
  for (let x = -H + R + 0.005; x < H - R; x += R)
    for (let z = -W + R + 0.005; z < W - R; z += R) {
      if (headString && x > -H / 2) continue;
      if (w.placeCue(x, z)) return { x, z };
    }
  return null;
}
