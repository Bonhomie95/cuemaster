import { Progress, groupOf } from "./progress";
/** Casual local rules: clear your group, then the eight without scratching. */
export function localWinner(p: Progress): number | null {
  if (!p.finished || p.breakChoice) return null;
  const group = p.groups[p.turn];
  const ownLeft = Array.from({ length: 15 }, (_, i) => i + 1).some(
    (id) => groupOf(id) === group && group !== null && !p.returned.includes(id),
  );
  return group && !ownLeft && p.groupClearBeforeShot && !p.foul && !p.scratch
    ? p.turn
    : 1 - p.turn;
}

/** Why a rack ended on the 8, from player 0's side (the phone's own player). Empty otherwise. */
export function eightBallNote(p: Progress, opponent: string): string {
  if (!p.finished || !p.returned.includes(8)) return "";
  const who = p.turn === 0 ? "You" : opponent;
  if (!p.foul && !p.scratch && p.groupClearBeforeShot)
    return `${who} sank the 8.`;
  return `${who} ${p.scratch ? "scratched on the 8" : p.foul ? "fouled on the 8" : "potted the 8 too early"}.`;
}
