// Starts local services; never terminates a service it did not start.
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const children = [];
const alive = (port) =>
  new Promise((resolve) => {
    const s = createConnection({ host: "127.0.0.1", port });
    s.setTimeout(500);
    s.on("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
function start(command, args, cwd = root) {
  const p = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    detached: process.platform !== "win32",
  });
  children.push(p);
  p.on("error", (e) => {
    console.error(e.message);
    stop(1);
  });
  p.on("exit", (code) => {
    if (!stopping && code !== 0) stop(code || 1);
  });
  return p;
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of children) {
    try {
      process.platform === "win32"
        ? p.kill("SIGTERM")
        : process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
async function wait(port) {
  for (let i = 0; i < 60; i++) {
    if (await alive(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw Error(`Service on port ${port} did not start.`);
}
// Another project may already own 8081; reusing its Metro serves the wrong app, so take the
// first free port and let the API accept that origin.
async function freePort(from) {
  for (let port = from; port < from + 20; port++)
    if (!(await alive(port))) return port;
  throw Error("No free port for Metro between 8081 and 8100.");
}
// server/.env is what the API actually reads; if it already names a database (Atlas, say),
// starting a local mongod here would be dead weight.
let configuredDatabase = process.env.MONGODB_URI || "";
try {
  configuredDatabase ||= /^\s*MONGODB_URI\s*=\s*(\S+)/m.exec(
    await readFile(resolve(root, "server/.env"), "utf8"),
  )?.[1];
} catch {}
try {
  if (!configuredDatabase && !(await alive(27028))) {
    await mkdir(resolve(root, ".data/mongo"), { recursive: true });
    start("mongod", [
      "--dbpath",
      resolve(root, ".data/mongo"),
      "--port",
      "27028",
      "--bind_ip",
      "127.0.0.1",
      "--logpath",
      resolve(root, ".data/mongo.log"),
    ]);
    await wait(27028);
  }
  const web = Number(process.env.WEB_PORT) || (await freePort(8081));
  if (!(await alive(4000))) {
    process.env.CORS_ORIGINS =
      process.env.CORS_ORIGINS ||
      `http://localhost:${web},http://127.0.0.1:${web}`;
    start("npm", ["run", "dev"], resolve(root, "server"));
    await wait(4000);
  } else console.log("Using existing API on port 4000.");
  const response = await fetch("http://127.0.0.1:4000/health");
  const health = await response.json();
  if (!health.ok || health.database !== "mongodb")
    throw Error("Port 4000 is not the CueMaster MongoDB API.");
  console.log(`CueMaster web preview: http://localhost:${web}`);
  start(
    "npm",
    ["run", "web", "--", "--port", String(web)],
    resolve(root, "mobile"),
  );
} catch (e) {
  console.error(e.message);
  stop(1);
}
