// Fresh API rate-limit state and a disposable MongoDB database for every run.
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../", import.meta.url)),
  cwd = root + "server";
const require = createRequire(
  new URL("../server/package.json", import.meta.url),
);
const { MongoClient } = require("mongodb");
const dbName = "cuemaster_tests_" + randomUUID().replaceAll("-", "") + "_qa";
const uri = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27028";
const dbClient = await new MongoClient(uri).connect();
let server,
  failed = false;
const freePort = () =>
  new Promise((resolve) => {
    const socket = createServer();
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
const stop = async () => {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill("SIGTERM");
  });
  server = null;
};
try {
  for (const file of (await readdir(cwd + "/tests"))
    .filter((f) => f.endsWith(".test.ts"))
    .sort()) {
    const port = await freePort(),
      base = "http://127.0.0.1:" + port;
    const env = {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      MONGODB_URI: uri,
      MONGODB_DB: dbName,
      TEST_API_URL: base,
      TEST_MONGODB_URI: uri,
      TEST_MONGODB_DB: dbName,
    };
    server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    server.stdout.on("data", (s) => {
      logs = (logs + s).slice(-4000);
    });
    server.stderr.on("data", (s) => {
      logs = (logs + s).slice(-4000);
    });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(base + "/health");
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      if (server.exitCode !== null) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready) throw Error("Test API did not start: " + logs);
    const code = await new Promise((resolve) => {
      const p = spawn(
        process.execPath,
        ["--import", "tsx", "--test", "tests/" + file],
        { cwd, env, stdio: "inherit" },
      );
      p.on("exit", resolve);
      p.on("error", () => resolve(1));
    });
    await stop();
    if (code !== 0) failed = true;
  }
} finally {
  await stop();
  await dbClient.db(dbName).dropDatabase();
  await dbClient.close();
}
if (failed) process.exitCode = 1;
