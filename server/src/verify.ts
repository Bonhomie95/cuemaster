import { World, drill, luckyRing } from "../../mobile/src/physics/engine";
export type Shot = { angle: number; power: number; side: number; top: number };
/** Strike one shot and run the table until it settles; returns the ticks it took. */
function play(world: World, shot: Shot) {
  if (
    !Object.values(shot).every(Number.isFinite) ||
    shot.power <= 0 ||
    shot.power > 1 ||
    Math.hypot(shot.side, shot.top) > 1.001
  )
    throw new Error("Invalid shot.");
  if (!world.strike(shot.angle, shot.power, shot.side, shot.top))
    throw new Error("Shot cannot be played.");
  let n = 0;
  while (world.active && n++ < 14400) {
    world.tick();
    world.events.length = 0;
  }
  if (world.active) throw new Error("Shot did not settle.");
  return n;
}
export function verifyReplay(name: string, shots: Shot[], targets: number[]) {
  const world = new World(drill(name));
  let ticks = 0;
  if (shots.length < 1 || shots.length > 12)
    throw new Error("Use between 1 and 12 shots.");
  for (const shot of shots) {
    ticks += play(world, shot);
    if (world.balls.find((b) => b.id === 0)?.pocketed)
      throw new Error("A scratch ends this challenge. Try again.");
  }
  const potted = world.balls
    .filter((b) => b.id !== 0 && b.pocketed)
    .map((b) => b.id);
  if (
    targets.length
      ? !targets.every((id) => potted.includes(id))
      : !potted.some((id) => id !== 8)
  )
    throw new Error("The challenge target has not been completed.");
  if (name === "break" && shots.length !== 1)
    throw new Error("The break challenge is one shot.");
  return {
    shots: shots.length,
    ticks,
    potted,
    score: shots.length * 1000000 + ticks,
  };
}
/** Lucky Shot: the one shot on the fixed layout, and the ring the cue ball stopped in. */
export function replayLucky(shot: Shot) {
  const world = new World(drill("lucky"));
  play(world, shot);
  const cue = world.balls[0];
  return { x: cue.x, z: cue.z, pocketed: cue.pocketed, ring: luckyRing(cue) };
}
