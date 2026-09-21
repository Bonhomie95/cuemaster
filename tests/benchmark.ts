import { World, rack, simulate } from "../mobile/src/physics/engine";
import { performance } from "node:perf_hooks";
import fs from "node:fs";
const runs = [];
for (let i = 0; i < 30; i++) {
  const w = new World(rack(i + 1));
  w.strike(0.007, 1, 0.1, 0.2);
  const start = performance.now();
  const ticks = simulate(w);
  runs.push({
    wallMs: performance.now() - start,
    simulatedSeconds: w.time,
    ticks,
    steps: w.steps,
    contacts: w.events.length,
    potted: w.balls.filter((b) => b.pocketed).length,
    maxOverlapMm: w.maxOverlap * 1000,
    settled: !w.active,
  });
}
const report = {
  date: new Date().toISOString(),
  runtime: process.version,
  architecture: process.arch,
  runs,
  meanMs: runs.reduce((n, r) => n + r.wallMs, 0) / runs.length,
};
fs.mkdirSync("../artifacts", { recursive: true });
fs.writeFileSync(
  "../artifacts/physics-benchmark.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      meanMs: report.meanMs,
      worstMs: Math.max(...runs.map((r) => r.wallMs)),
      settled: runs.every((r) => r.settled),
      maxOverlapMm: Math.max(...runs.map((r) => r.maxOverlapMm)),
    },
    null,
    2,
  ),
);
