import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import {
  planCpuShot,
  cpuPlacement,
  formSkill,
  type CpuStyle,
} from "../../mobile/src/game/cpu";
import type { Session, Action } from "../../mobile/src/game/session";
import { venues } from "./catalog";

/**
 * House players: the club's own accounts, seated against a player when nobody else is waiting.
 *
 * Each one is a real player document (a name, a flag, a level, a trophy count that moves with
 * every result), so profile cards, leaderboards and rematches work exactly as they do for any
 * account. Inside the game nothing marks them; the Terms of Service and the store review notes
 * are where the arrangement is stated, as the owner decided on 2026-10-29.
 *
 * They play on the same engine as everything else, at a strength set by the opponent's last
 * five results, so a player on a losing run meets a softer game and a player on a roll meets a
 * harder one. `HOUSE` holds every number worth tuning.
 */
export const HOUSE = {
  /** Seconds a queued player waits for a person before a house player is seated. */
  waitMs: [6_000, 9_000] as const,
  /** Thinking time before a shot, and before a placement or break decision. */
  thinkMs: [2_600, 6_500] as const,
  quickMs: [1_200, 2_400] as const,
  /** How the house reacts after the rack: offer a rematch, accept one, or wander off. */
  rematchOffer: 0.3,
  rematchAccept: 0.65,
  leaveAfterMs: [8_000, 14_000] as const,
  emote: { goodShot: 0.35, oops: 0.4, goodGame: 0.5 },
};
export const between = (
  [low, high]: readonly [number, number],
  random = Math.random,
) => low + random() * (high - low);

type Entry = {
  slug: string;
  name: string;
  country: string;
  avatar: 0 | 1;
  style: CpuStyle;
  cue: "club" | "precision" | "master";
  trophies: number;
  xp: number;
};
const e = (
  slug: string,
  name: string,
  country: string,
  avatar: 0 | 1,
  style: CpuStyle,
  cue: Entry["cue"],
  trophies: number,
  xp: number,
): Entry => ({ slug, name, country, avatar, style, cue, trophies, xp });
/** Forty regulars. Handles, not full names: that is what real accounts look like. */
export const ROSTER: Entry[] = [
  e("tunde-b", "Tunde_B", "NG", 0, "steady", "club", 48, 230),
  e("chidi-king", "ChidiKing", "NG", 1, "power", "precision", 160, 740),
  e("amaka-x", "amaka_x", "NG", 1, "spin", "club", 72, 310),
  e("emeka9", "Emeka9ja", "NG", 0, "safe", "club", 24, 150),
  e("yemi-pots", "YemiPots", "NG", 0, "steady", "precision", 210, 880),
  e("funke-o", "Funke.O", "NG", 1, "spin", "club", 96, 420),
  e("kunle-snooks", "KunleSnooks", "NG", 0, "power", "master", 310, 1260),
  e("ngozi-a", "Ngozi_A", "NG", 1, "safe", "club", 40, 190),
  e("bolu-breaks", "BoluBreaks", "NG", 0, "power", "club", 128, 560),
  e("ifeanyi-c", "ifeanyi.c", "NG", 1, "steady", "precision", 184, 790),
  e("segun-lagos", "SegunLagos", "NG", 0, "safe", "club", 64, 280),
  e("temi-t", "TemiTemi", "NG", 1, "spin", "club", 16, 120),
  e("kofi-cues", "KofiCues", "GH", 0, "steady", "club", 88, 390),
  e("ama-serwaa", "AmaSerwaa", "GH", 1, "safe", "club", 56, 260),
  e("kwame-k", "Kwame_K", "GH", 0, "power", "precision", 232, 960),
  e("wanjiru", "Wanjiru254", "KE", 1, "steady", "club", 104, 450),
  e("otieno", "OtienoJ", "KE", 0, "spin", "club", 36, 180),
  e("thabo-m", "Thabo_M", "ZA", 0, "safe", "precision", 152, 660),
  e("lerato", "LeratoP", "ZA", 1, "steady", "club", 80, 350),
  e("omar-cairo", "OmarCairo", "EG", 0, "power", "club", 120, 520),
  e("youssef-8", "Youssef8", "EG", 0, "spin", "precision", 176, 760),
  e("jamie-uk", "JamieUK", "GB", 0, "steady", "club", 92, 400),
  e("callum-s", "callum_s", "GB", 0, "safe", "precision", 198, 840),
  e("marcus-nyc", "MarcusNYC", "US", 0, "power", "master", 288, 1180),
  e("tyler-d", "TylerD", "US", 0, "steady", "club", 44, 210),
  e("arjun-p", "ArjunP", "IN", 0, "spin", "club", 68, 300),
  e("priya-cue", "PriyaCue", "IN", 1, "safe", "precision", 140, 600),
  e("rafa-br", "RafaBR", "BR", 0, "power", "club", 112, 480),
  e("jhun-ph", "JhunPH", "PH", 0, "steady", "club", 60, 270),
  e("budi-id", "Budi_ID", "ID", 0, "safe", "club", 32, 170),
  e("zainab-k", "ZainabK", "NG", 1, "steady", "precision", 168, 720),
  e("dayo-d", "DayoD", "NG", 0, "spin", "club", 20, 140),
  e("adaeze", "Adaeze_", "NG", 1, "power", "club", 136, 580),
  e("femi-f", "FemiFire", "NG", 0, "power", "precision", 244, 1000),
  e("naomi-g", "NaomiG", "GH", 1, "safe", "club", 52, 240),
  e("akosua", "Akosua", "GH", 1, "spin", "club", 76, 330),
  e("sipho", "SiphoZ", "ZA", 0, "steady", "club", 100, 440),
  e("mo-dubai", "MoDubai", "AE", 0, "safe", "master", 326, 1340),
  e("hana-tk", "HanaTK", "JP", 1, "steady", "precision", 204, 860),
  e("lea-paris", "LeaParis", "FR", 1, "spin", "club", 84, 370),
];

/** A stable id that looks like every other player's id. */
export const houseId = (slug: string) => {
  const h = createHash("sha256")
    .update("cuemaster-house:" + slug)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const COINS = 200_000;

/** Create any house account that is missing. Existing ones keep the record they have built. */
export async function ensureHouse(db: Db) {
  const users = db.collection<any>("players");
  const base = Date.now() - 70 * 86_400_000;
  for (const [i, r] of ROSTER.entries()) {
    const played = Math.round(r.trophies / 12) + 6;
    const wins = Math.round(played * 0.52);
    await users.updateOne(
      { _id: houseId(r.slug) },
      {
        $setOnInsert: {
          house: true,
          houseStyle: r.style,
          name: r.name,
          country: r.country,
          avatar: r.avatar,
          xp: r.xp,
          trophies: r.trophies,
          rubies: 0,
          crates: [],
          completed: [],
          selectedTable:
            venues.filter((v) => v.level <= 1 + Math.floor(r.xp / 100)).at(-1)
              ?.id || "heritage",
          selectedCue: r.cue,
          ownedCues: ["club", "precision", "master"].slice(
            0,
            ["club", "precision", "master"].indexOf(r.cue) + 1,
          ),
          providers: {},
          adultConfirmed: true,
          createdAt: new Date(base + i * 1.6 * 86_400_000),
          stats: {
            finishes: Math.round(r.xp / 60),
            shots: Math.round(r.xp / 4),
            onlineMatches: played,
            onlineWins: wins,
            onlineLosses: played - wins,
            coinsWon: wins * 180,
          },
        },
        // Entries are charged like anyone's; the balance is simply never allowed to run dry.
        $max: { coins: COINS },
      },
      { upsert: true },
    );
  }
}

/**
 * Pick an opponent for a player: one of the six nearest by trophies that is free, not blocked
 * and not the one they just played, with its strength set from the player's recent form and
 * the room (the higher venues' regulars are better players).
 */
export async function pickHouse(
  db: Db,
  player: { id: string; trophies: number; form: number[]; blocked: string[] },
  venueId: string,
  busy: Iterable<string>,
  avoid?: string,
  random = Math.random,
) {
  const users = db.collection<any>("players");
  const taken = new Set([...busy, ...player.blocked, avoid || "", player.id]);
  const pool = (await users.find({ house: true }).toArray()).filter(
    (u) => !taken.has(u._id),
  );
  if (!pool.length) return null;
  pool.sort(
    (a, b) =>
      Math.abs((a.trophies || 0) - player.trophies) -
      Math.abs((b.trophies || 0) - player.trophies),
  );
  const near = pool.slice(0, 6);
  const doc = near[Math.floor(random() * near.length)];
  const venue = venues.find((v) => v.id === venueId);
  return {
    doc,
    style: (doc.houseStyle || "steady") as CpuStyle,
    skill: formSkill(player.form, venue?.level || 1, random),
  };
}

/** What the house does with the table it holds: a break decision, a placement or a shot. */
export function houseTurn(
  s: Session,
  skill: number,
  style: CpuStyle,
  random = Math.random,
): Action | null {
  if (s.progress.breakChoice)
    return {
      t: "break",
      choice: s.progress.breakChoice === "eight" ? "spot" : "hand",
    };
  if (s.placement) {
    const pos = cpuPlacement(s.world.balls, s.headStringPlacement);
    return pos ? { t: "place", x: pos.x, z: pos.z } : null;
  }
  return {
    t: "shot",
    ...planCpuShot(
      s.world.balls,
      s.progress,
      skill,
      s.drill === "break" && s.shots === 0,
      random,
      style,
    ),
  };
}
