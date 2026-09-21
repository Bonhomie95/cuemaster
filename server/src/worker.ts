import { parentPort, workerData } from "node:worker_threads";
import { verifyReplay } from "./verify";
try {
  parentPort!.postMessage({
    result: verifyReplay(
      workerData.drill,
      workerData.shots,
      workerData.targets,
    ),
  });
} catch (e) {
  parentPort!.postMessage({ error: (e as Error).message });
}
