import type { Tournament, EventPhase } from "./api";
/**
 * What a competition says about itself at a glance, derived on the device from the same fields
 * the server publishes so a card, the home tile and the event sheet never disagree.
 */
export function eventState(t: Tournament, now = Date.now()) {
  const at = (iso?: string | null) => (iso ? Date.parse(iso) : NaN);
  const closed = t.status === "closed" || at(t.endsAt) <= now;
  if (t.status === "cancelled")
    return {
      key: "cancelled" as EventPhase,
      icon: "x-circle",
      text: "CANCELLED",
    };
  if (t.status === "announced")
    return {
      key: "announced" as EventPhase,
      icon: "clock",
      text: "COMING SOON",
    };
  if (closed)
    return { key: "closed" as EventPhase, icon: "flag", text: "FINISHED" };
  if (Number.isFinite(at(t.joinDeadline)) && at(t.joinDeadline) > now)
    return {
      key: "registration" as EventPhase,
      icon: "zap",
      text: "ENTER NOW",
    };
  if (Number.isFinite(at(t.startsAt)) && at(t.startsAt) > now)
    return { key: "waiting" as EventPhase, icon: "clock", text: "STARTS SOON" };
  return { key: "play" as EventPhase, icon: "play", text: "IN PLAY" };
}
export function formatLabel(t: Tournament) {
  return t.format === "series"
    ? t.bestOf === 1
      ? "Game of 1 · vs club rival"
      : `Best of ${t.bestOf} · vs club rival`
    : "Straight-pot score attack";
}
export function framesToWin(bestOf: number) {
  return Math.ceil(bestOf / 2);
}
/** "2d 04h", "01:12:09" or "00:45": the shape a player expects on a countdown. */
export function countdown(ms: number) {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000),
    d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60,
    two = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${two(h)}h`;
  if (h > 0) return `${two(h)}:${two(m)}:${two(sec)}`;
  return `${two(m)}:${two(sec)}`;
}
export function whenLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
