import type { Express, RequestHandler } from "express";
import type { Db } from "mongodb";
import { currentWeek } from "./season";
import { grant, publicReward, type CrateTier } from "./daily";

/**
 * Weekly leagues.
 *
 * A player joins the week's league with their first finished online match, at their tier and
 * with their trophies as they stand then. Each tier's players for the week are cut into leagues
 * of up to 50, ordered by those trophies, and ranked inside their league by coins won from
 * online pots this week. When the week ends (Monday 00:00 UTC) the top fifth of a league, ten in
 * a full one, move up a tier and earn a crate; the bottom fifth, ten in a full one, drop a tier.
 *
 * Settling is lazy and per player: a finished week is settled on that player's first request
 * after it ends (opening the league, or their next online result), with no scheduled job. A
 * finished week's entries never change again, so every player computes the same table; the tier
 * change and the crate land in one write keyed on the week, so a repeated or concurrent request
 * settles nothing twice.
 *
 * Private rooms count for nothing here: a friend you pick is the easiest pot to arrange.
 */
export const LEAGUES: { name: string; crate: CrateTier }[] = [
  { name: "Bronze", crate: "club" },
  { name: "Silver", crate: "silver" },
  { name: "Gold", crate: "gold" },
  { name: "Platinum", crate: "champion" },
  { name: "Diamond", crate: "master" },
];
export const LEAGUE_SIZE = 50;
/** A full league moves its top ten up and its bottom ten down; a smaller one a fifth each way. */
export const zones = (size: number) => ({
  promote: Math.min(10, Math.ceil(size / 5)),
  relegate: Math.min(10, Math.floor(size / 5)),
});

type Entry = {
  playerId: string;
  trophies: number;
  coins: number;
  scoredAt: Date;
};
const byId = (a: Entry, b: Entry) =>
  a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;

/**
 * The league `playerId` plays in: their tier's entries for the week ordered by trophies, cut
 * into the fewest even-sized leagues of up to 50, then ranked by coins won, first to score
 * ahead on a tie.
 */
export function leagueOf(tier: Entry[], playerId: string) {
  const sorted = [...tier].sort(
    (a, b) => b.trophies - a.trophies || byId(a, b),
  );
  const groups = Math.ceil(sorted.length / LEAGUE_SIZE);
  const groupAt = (i: number) => Math.floor((i * groups) / sorted.length);
  const group = groupAt(sorted.findIndex((e) => e.playerId === playerId));
  const standings = sorted
    .filter((_, i) => groupAt(i) === group)
    .sort(
      (a, b) => b.coins - a.coins || +a.scoredAt - +b.scoredAt || byId(a, b),
    );
  return { group, groups, standings };
}

/** What finishing `rank` (from 0) of `size` does to a player who played the week in `tier`. */
export function outcome(
  rank: number,
  size: number,
  tier: number,
  coins: number,
) {
  const z = zones(size);
  // Going up takes at least one pot won; the top league keeps its crate with nowhere higher.
  if (rank < z.promote && coins > 0)
    return {
      result: "promoted",
      tier: Math.min(LEAGUES.length - 1, tier + 1),
      crate: LEAGUES[tier].crate,
    };
  if (rank >= size - z.relegate && tier > 0)
    return { result: "relegated", tier: tier - 1, crate: null };
  return { result: "stayed", tier, crate: null };
}

const entriesOf = (db: Db) => db.collection<any>("leagueEntries");
// ponytail: every view and every settle reads the tier's whole week to cut its leagues. Once a
// tier holds thousands a week, store each entry's league number when the week closes instead.
const tierOfWeek = (db: Db, week: number, tier: number) =>
  entriesOf(db)
    .find(
      { week, tier },
      { projection: { playerId: 1, trophies: 1, coins: 1, scoredAt: 1 } },
    )
    .toArray() as Promise<Entry[]>;

/** Settle every finished week this player has not been settled for, oldest first. */
export async function settleLeague(
  db: Db,
  playerId: string,
  week = currentWeek().id,
) {
  const users = db.collection<any>("players");
  const open = await entriesOf(db)
    .find({ playerId, week: { $lt: week }, result: { $exists: false } })
    .sort({ week: 1 })
    .toArray();
  for (const entry of open) {
    const { standings } = leagueOf(
      await tierOfWeek(db, entry.week, entry.tier),
      playerId,
    );
    const rank = standings.findIndex((e) => e.playerId === playerId);
    const o = outcome(rank, standings.length, entry.tier, entry.coins);
    const { stages, paid } = grant(o.crate ? { crate: o.crate } : {});
    const last = {
      week: entry.week,
      from: entry.tier,
      tier: o.tier,
      rank: rank + 1,
      size: standings.length,
      coins: entry.coins,
      result: o.result,
    };
    const updated = await users.findOneAndUpdate(
      { _id: playerId, leagueWeek: { $not: { $gte: entry.week } } },
      [
        ...stages,
        {
          $set: {
            leagueTier: o.tier,
            leagueWeek: entry.week,
            leagueLast: { $literal: last },
          },
        },
      ],
      { returnDocument: "after" },
    );
    // Display only: whether the crate found a slot, read back from the write that paid it.
    if (updated && o.crate)
      await users.updateOne(
        { _id: playerId, "leagueLast.week": entry.week },
        { $set: { "leagueLast.granted": paid(updated) } },
      );
    await entriesOf(db).updateOne(
      { _id: entry._id },
      { $set: { result: o.result } },
    );
  }
}

/**
 * Count a finished matchmade online match toward this week's league: the first one joins it.
 * Fire-and-forget like `track()`; called once per player by the write that settled the match.
 */
export async function recordLeague(db: Db, playerId: string, coins: number) {
  try {
    const week = currentWeek().id;
    // Last week first, so a promotion decides the tier this week is played in.
    await settleLeague(db, playerId, week);
    const u = await db
      .collection<any>("players")
      .findOne(
        { _id: playerId },
        { projection: { leagueTier: 1, trophies: 1 } },
      );
    if (!u) return;
    const now = new Date();
    const join = {
      week,
      playerId,
      tier: u.leagueTier || 0,
      trophies: u.trophies || 0,
      joinedAt: now,
    };
    await entriesOf(db).updateOne(
      { _id: `${week}:${playerId}` },
      coins > 0
        ? { $setOnInsert: join, $inc: { coins }, $set: { scoredAt: now } }
        : { $setOnInsert: { ...join, coins: 0, scoredAt: now } },
      { upsert: true },
    );
  } catch (e) {
    console.error("League tracking failed", (e as Error)?.name);
  }
}

export function installLeagues(app: Express, db: Db, required: RequestHandler) {
  const users = db.collection<any>("players");
  void entriesOf(db)
    .createIndex({ week: 1, tier: 1 })
    .catch(() => {});
  void entriesOf(db)
    .createIndex({ playerId: 1, week: 1 })
    .catch(() => {});
  const crate = (tier: number) =>
    publicReward({ crate: LEAGUES[tier].crate }).crate;

  app.get("/me/league", required, async (req: any, res) => {
    const week = currentWeek();
    await settleLeague(db, req.player._id, week.id);
    const u = await users.findOne({ _id: req.player._id });
    const entry = await entriesOf(db).findOne({ _id: `${week.id}:${u._id}` });
    let league = null;
    if (entry) {
      const { group, groups, standings } = leagueOf(
        await tierOfWeek(db, week.id, entry.tier),
        u._id,
      );
      const people = new Map(
        (
          await users
            .find(
              { _id: { $in: standings.map((e) => e.playerId) } },
              { projection: { name: 1, country: 1, suspended: 1 } },
            )
            .toArray()
        ).map((p) => [p._id, p]),
      );
      const blocked = new Set(u.blockedPlayers || []);
      league = {
        tier: entry.tier,
        name: LEAGUES[entry.tier].name,
        number: group + 1,
        count: groups,
        crate: crate(entry.tier),
        ...zones(standings.length),
        standings: standings.map((e, i) => {
          const p = people.get(e.playerId);
          // Ranks stay put; a suspended or blocked player's name is not shown.
          const shown = !!p && !p.suspended && !blocked.has(e.playerId);
          return {
            rank: i + 1,
            name: shown ? p.name : "Player",
            country: shown ? p.country || "" : "",
            coins: e.coins,
            you: e.playerId === u._id,
          };
        }),
      };
    }
    const tier = u.leagueTier || 0;
    res.json({
      week,
      tier,
      name: LEAGUES[tier].name,
      size: LEAGUE_SIZE,
      leagues: LEAGUES.map((l, i) => ({ name: l.name, crate: crate(i) })),
      league,
      last: u.leagueLast
        ? {
            ...u.leagueLast,
            name: LEAGUES[u.leagueLast.from].name,
            next: LEAGUES[u.leagueLast.tier].name,
          }
        : null,
    });
  });
}
