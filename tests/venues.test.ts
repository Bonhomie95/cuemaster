import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { venues, venueLock, cityChallenges } from "../server/src/catalog";
import { skins } from "../mobile/src/game/session";
import { cityDrillNames } from "../mobile/src/physics/engine";
import { coinsShort, lockOf } from "../mobile/src/app/ladder";

test("the venue ladder climbs from Lagos to a billion-coin table, every room fully dressed", () => {
  assert.equal(venues[0].name, "Lagos");
  assert.equal(venues.at(-1)!.entry, 1_000_000_000);
  venues.forEach((v, i) => {
    if (i) {
      assert.ok(v.entry > venues[i - 1].entry, v.id + " costs more");
      assert.ok(v.level >= venues[i - 1].level, v.id + " asks a level");
      assert.ok(v.wins > 0, v.id + " asks for wins");
    }
    assert.ok(skins[v.skin], v.id + " has a table finish");
    assert.ok(
      existsSync(`${__dirname}/../mobile/assets/lounge/${v.id}.jpg`),
      v.id + " has card art",
    );
    const shots = cityChallenges.filter((c) => c.city === v.id);
    assert.equal(shots.length, 2, v.id + " has two trick shots");
    for (const c of shots)
      assert.ok(cityDrillNames.includes(c.drill), c.drill + " has a layout");
  });
});

test("a table opens on its level and on refereed wins at the one before it", () => {
  const london = venues[1];
  assert.equal(venueLock({ xp: 0 }, venues[0]), null);
  assert.equal(venueLock({ xp: 0 }, london), "Level 2 required");
  assert.equal(venueLock({ xp: 100 }, london), "Win 2 in Lagos · 0/2");
  assert.equal(
    venueLock({ xp: 100, venueWins: { heritage: 1 } }, london),
    "Win 2 in Lagos · 1/2",
  );
  assert.equal(
    venueLock({ xp: 100, venueWins: { heritage: 2 } }, london),
    null,
  );
  // The app trusts the server's lock text, and falls back to the level alone without it.
  const player: any = { level: 1, locks: { riviera: "Win 2 in Lagos · 0/2" } };
  assert.equal(lockOf(player, london as any), "Win 2 in Lagos · 0/2");
  assert.equal(lockOf({ level: 1 } as any, london as any), "Level 2 required");
});

test("coin amounts read short past ten thousand and round up across units", () => {
  assert.equal(coinsShort(9_999), "9,999");
  assert.equal(coinsShort(10_000), "10K");
  assert.equal(coinsShort(250_000), "250K");
  assert.equal(coinsShort(999_949), "999.9K");
  assert.equal(coinsShort(999_950), "1M");
  assert.equal(coinsShort(2_500_000), "2.5M");
  assert.equal(coinsShort(1_000_000_000), "1B");
  assert.equal(coinsShort(2_000_000_000), "2B");
  assert.equal(coinsShort(950_000, 1_000_000), "950,000");
});
