// Plain JavaScript on purpose: Node's own TypeScript stripping cannot follow the shared physics
// imports (extensionless paths and a JSON table), and tsx's loader hooks registered for the main
// thread do not reach a worker started with its own execArgv. tsImport scopes the hooks to this
// thread, so the verifier runs the same source as the API and the client.
import { parentPort, workerData } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";
try {
  const { verifyReplay } = await tsImport("./verify.ts", import.meta.url);
  parentPort.postMessage({
    result: verifyReplay(
      workerData.drill,
      workerData.shots,
      workerData.targets,
    ),
  });
} catch (e) {
  parentPort.postMessage({ error: e.message });
}
