// Walks every club screen and both kinds of match in headless Chrome, failing on any console
// error or missing control, and (with --store) saves store screenshots at store sizes.
//
//   npm run dev                      # API on :4000, web build on :8081
//   node tools/ui-walk.mjs           # the walk; exits 1 on the first failure
//   node tools/ui-walk.mjs --store   # the walk at store sizes, PNGs in artifacts/store-screenshots
//
// Two pages on two origins (localhost and 127.0.0.1) are two separate players, so the online
// match is played for real between them. Controls are found by their accessibility labels,
// the same names a screen reader announces, so a renamed or missing button fails the walk.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const WEB = process.env.WEB_URL || "http://localhost:8081";
const WEB2 = WEB.replace("localhost", "127.0.0.1");
const store = process.argv.includes("--store");
const SIZES = store
  ? [
      // Google Play: 16:9 at 1920x1080.
      { name: "play-1920x1080", width: 960, height: 540, scale: 2 },
      // App Store: 6.9" display, landscape.
      { name: "appstore-2868x1320", width: 956, height: 440, scale: 3 },
    ]
  : [{ name: "phone", width: 874, height: 402, scale: 2 }];
const CHROME =
  process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = await mkdtemp(join(tmpdir(), "cuemaster-walk-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--remote-debugging-port=9334",
    `--user-data-dir=${profile}`,
    "--use-angle=metal",
    "--enable-unsafe-swiftshader",
    "--autoplay-policy=no-user-gesture-required",
    "about:blank",
  ],
  { stdio: "ignore" },
);
let version;
for (let i = 0; i < 50 && !version; i++) {
  await sleep(200);
  version = await fetch("http://127.0.0.1:9334/json/version")
    .then((r) => r.json())
    .catch(() => null);
}
if (!version) throw Error("Chrome did not start.");

/** One browser tab, driven over the DevTools protocol. */
async function open(url, size) {
  const target = await fetch(`http://127.0.0.1:9334/json/new?about:blank`, {
    method: "PUT",
  }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method === "Runtime.exceptionThrown")
      errors.push(
        m.params.exceptionDetails.exception?.description || "exception",
      );
    else if (
      m.method === "Runtime.consoleAPICalled" &&
      m.params.type === "error"
    )
      errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, (m) =>
        m.error ? reject(Error(m.error.message)) : resolve(m.result),
      );
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: size.width,
    height: size.height,
    deviceScaleFactor: size.scale,
    mobile: true,
    screenOrientation: { type: "landscapePrimary", angle: 90 },
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.navigate", { url });
  const page = {
    errors,
    send,
    async eval(expression) {
      const r = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails)
        throw Error(r.exceptionDetails.exception?.description || expression);
      return r.result.value;
    },
    /** Poll a page expression until it is truthy. */
    async until(expression, ms = 30000) {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (await page.eval(expression).catch(() => false)) return;
        await sleep(200);
      }
      throw Error(`Timed out waiting for ${expression}`);
    },
    async text() {
      return page.eval("document.body.innerText");
    },
    /** Wait until the page shows `text` (string or RegExp source). */
    async see(text, ms = 20000) {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const body = await page.text().catch(() => "");
        if (text instanceof RegExp ? text.test(body) : body.includes(text))
          return;
        await sleep(250);
      }
      throw Error(`Never saw "${text}"`);
    },
    /** Click the control a screen reader would call `label` (exact, then prefix). */
    async tap(label, ms = 15000) {
      const start = Date.now();
      while (Date.now() - start < ms) {
        const hit = await page.eval(`(() => {
          const all = [...document.querySelectorAll('[aria-label]')];
          const el = all.find(e => e.getAttribute('aria-label') === ${JSON.stringify(label)})
            || all.find(e => e.getAttribute('aria-label').startsWith(${JSON.stringify(label)}));
          if (!el || el.getAttribute('aria-disabled') === 'true') return false;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.click();
          return true;
        })()`);
        if (hit) {
          await sleep(450);
          return;
        }
        await sleep(250);
      }
      throw Error(`No enabled control "${label}"`);
    },
    async type(label, value) {
      await page.eval(`(() => {
        const el = document.querySelector('[aria-label=${JSON.stringify(label)}]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await sleep(200);
    },
    async shot(dir, name) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${name}.png`), Buffer.from(data, "base64"));
    },
    close: () => ws.close(),
  };
  return page;
}

// ---------------------------------------------------------------- the walk
/** Every step names what a player does; the walk stops at the first one that fails. */
async function walk(size) {
  const out = join(
    root,
    "artifacts",
    store ? "store-screenshots" : "ui-walk",
    size.name,
  );
  const a = await open(WEB, size);
  const b = await open(WEB2, size);
  const pages = { a, b };
  const snap = (p, name) => p.shot(out, name);
  const checks = [];
  const check = async (name, fn) => {
    const started = Date.now();
    try {
      await fn();
      checks.push({ name, ok: true, ms: Date.now() - started });
      console.log(`  ✔ ${name}`);
    } catch (e) {
      checks.push({ name, ok: false, error: e.message });
      console.log(`  ✘ ${name}: ${e.message}`);
      throw e;
    }
  };
  const enter = async (p) => {
    await p.see("Play as guest", 60000);
    await p.tap("I am 18 or older");
    await p.tap("Enter as guest");
    await p.see("Who's at the table?");
  };
  try {
    for (const run of walkSteps)
      await run({ ...pages, snap, check, enter, sleep });
  } finally {
    const errors = [...a.errors, ...b.errors].filter(
      // Development-only React and Expo noise, not app failures.
      (e) =>
        !/DevTools|deprecated|useNativeDriver|THREE\.Clock|Download the React/i.test(
          e,
        ),
    );
    if (errors.length) console.log("Console errors:\n  " + errors.join("\n  "));
    a.close();
    b.close();
    if (errors.length) throw Error(`${errors.length} console error(s)`);
  }
  return checks;
}
// Steps live in tools/ui-walk-steps.mjs so the engine stays small.
const { walkSteps } = await import("./ui-walk-steps.mjs");

let failed = false;
try {
  for (const size of SIZES) {
    console.log(`Walking at ${size.name}`);
    await walk(size);
  }
} catch (e) {
  failed = true;
  console.error(e.message);
} finally {
  chrome.kill();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
process.exit(failed ? 1 : 0);
