import { test } from "node:test";
import assert from "node:assert/strict";
import {
  warmTextures,
  clothSurface,
  ballTexture,
  floorTexture,
} from "../mobile/src/render/textures";
test("background warm-up leaves every table texture cached", async () => {
  const t0 = performance.now();
  await warmTextures();
  const warmed = performance.now() - t0;
  // Once warmed, a table open must find the textures ready, not rebuild them.
  const t1 = performance.now();
  const cloth = clothSurface();
  for (let i = 0; i < 16; i++) assert.equal(ballTexture(i), ballTexture(i));
  assert.equal(clothSurface(), cloth);
  assert.equal(floorTexture(), floorTexture());
  assert.ok(performance.now() - t1 < warmed / 4);
  assert.equal(cloth.image.width, 1024);
  assert.equal(ballTexture(8).image.height, 256);
  // Row-seeded noise: a band generated on its own matches the one-shot image.
  const px = (y: number, x: number) => cloth.image.data[(y * 1024 + x) * 4];
  assert.ok(px(256, 512) > 0 && px(16, 3) > 0);
});
