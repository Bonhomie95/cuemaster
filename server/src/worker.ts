import { parentPort, workerData } from "node:worker_threads";
import { verifyReplay } from "./verify";
import { replayMatch } from "../../mobile/src/game/session";
try {
  parentPort!.postMessage({
    result: workerData.match
      ? replayMatch(
          workerData.match.opponent,
          workerData.match.seed,
          workerData.match.actions,
        )
      : verifyReplay(workerData.drill, workerData.shots, workerData.targets),
  });
} catch (e) {
  parentPort!.postMessage({ error: (e as Error).message });
}
