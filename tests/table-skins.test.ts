import { test } from "node:test";
import assert from "node:assert/strict";
import { skins } from "../mobile/src/game/session";
import { ballColors } from "../mobile/src/render/textures";

/** sRGB hex to CIE L*a*b* (D65). */
function lab(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047),
    y = f(r * 0.2126 + g * 0.7152 + b * 0.0722),
    z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const difference = (a: string, b: string) => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

test("every city's cloth keeps all fifteen balls readable", () => {
  assert.equal(skins.length, 14);
  for (const skin of skins)
    for (const ball of ballColors)
      assert.ok(
        difference(skin.cloth, ball) >= 25,
        `${skin.name} cloth ${skin.cloth} is too close to ball ${ball}`,
      );
});
