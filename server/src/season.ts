/**
 * Seasons for the CueMaster Pass: fixed 28-day windows counted from a Monday in UTC, so every
 * server and every test agrees on the current season without storing anything.
 */
const EPOCH = Date.UTC(2026, 9, 5); // Monday 5 October 2026, 00:00 UTC
export const SEASON_DAYS = 28;
const LENGTH = SEASON_DAYS * 86400000;

export function currentSeason(now = Date.now()) {
  const index = Math.floor((now - EPOCH) / LENGTH);
  return {
    id: index + 1,
    startsAt: new Date(EPOCH + index * LENGTH),
    endsAt: new Date(EPOCH + (index + 1) * LENGTH),
  };
}
