/** Countdown alerts use the equipped cue's final third, never a fixed duration. */
export function clockUrgent(seconds: number, total: number, ticking: boolean) {
  return ticking && seconds > 0 && seconds <= total / 3;
}
