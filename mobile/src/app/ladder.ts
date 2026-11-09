import type { Player, Venue } from "./api";

/** What a table still asks of this player, or null when it is theirs to play. */
export const lockOf = (p: Player, v: Venue) =>
  p.locks
    ? p.locks[v.id] || null
    : p.level < v.level
      ? `Level ${v.level} required`
      : null;

/** Coins as players read them: exact below `from`, then 10K, 2.5M, 1B. */
export function coinsShort(n: number, from = 10_000) {
  if (n < from) return n.toLocaleString("en-US");
  const [d, unit] =
    n >= 999_950_000 ? [1e9, "B"] : n >= 999_950 ? [1e6, "M"] : [1e3, "K"];
  return `${+(n / d).toFixed(1)}${unit}`;
}
