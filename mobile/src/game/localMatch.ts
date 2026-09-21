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
