import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../mobile/", import.meta.url));

// A missing image passes tsc and every unit test, then breaks the app bundle on the phone.
test("every file the app requires by relative path exists", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) files.push(p);
    }
  };
  walk(app + "src");
  files.push(app + "App.tsx", app + "TableGame.tsx", app + "index.ts");
  const missing = files.flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/require\("(\.[^"]+)"\)/g)]
      .map((m) => join(dirname(f), m[1]))
      .filter(
        (p) =>
          !existsSync(p) && !existsSync(p + ".ts") && !existsSync(p + ".tsx"),
      )
      .map((p) => `${f} -> ${p}`),
  );
  assert.deepEqual(missing, []);
});
