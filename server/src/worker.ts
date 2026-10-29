import { parentPort } from "node:worker_threads";
import { verifyReplay, replayLucky } from "./verify";
import { replayMatch } from "../../mobile/src/game/session";
// Resident referee: one job at a time, answered on the same port it arrived on.
parentPort!.on("message", (job) => {
  try {
    parentPort!.postMessage({
      result: job.lucky
        ? replayLucky(job.lucky)
        : job.match
          ? replayMatch(job.match.opponent, job.match.seed, job.match.actions)
          : verifyReplay(job.drill, job.shots, job.targets),
    });
  } catch (e) {
    parentPort!.postMessage({ error: (e as Error).message });
  }
});
