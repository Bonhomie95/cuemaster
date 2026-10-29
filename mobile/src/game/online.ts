import { API, sessionToken, Player, Venue } from "../app/api";
import { session, Action, TableState } from "./session";

/**
 * The phone's half of an online match: one socket to the server's referee, and the glue that
 * feeds the opponent's moves into the shared session. The table logic itself lives in
 * `Session.updateRemote`; this file only moves messages.
 */
export type Profile = {
  id: string;
  name: string;
  country: string;
  avatar: number;
  level: number;
  trophies: number;
  wins: number;
  matches: number;
};
export type OnlineMatch = {
  id: string;
  seat: number;
  venue: Venue;
  entry: number;
  pot: number;
  private: boolean;
  opponent: Profile;
  cues: string[];
  introUntil: number;
};
export type OnlineResult = {
  won: boolean;
  draw: boolean;
  reason: string;
  pot: number;
  refunded: number;
  trophies: number;
  xp: number;
  crate: { name: string; tier: string } | null;
  player: Player | null;
  revealAt: number;
};
type Status =
  "idle" | "connecting" | "queued" | "room" | "playing" | "ended" | "offline";

const socketUrl = () => API.replace(/^http/, "ws") + "/live";

class Online {
  status: Status = "idle";
  online = 0;
  error = "";
  roomCode = "";
  venueId = "";
  match: OnlineMatch | null = null;
  result: OnlineResult | null = null;
  /** When the opponent dropped, the time their seat is forfeited; 0 while they are here. */
  opponentAwayUntil = 0;
  opponentLeft = false;
  rematchOffered = false;
  rematchAsked = false;
  emotes: string[] = [];
  bubble: { mine: boolean; text: string; at: number } | null = null;
  private ws: WebSocket | null = null;
  private ready: Promise<void> | null = null;
  private retry = 0;
  private aimTimer: ReturnType<typeof setInterval> | null = null;
  private lastAim = "";
  revision = 0;
  private listeners = new Set<() => void>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.revision;
  private notify() {
    this.revision++;
    this.listeners.forEach((f) => f());
  }
  private send(m: any) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  /** Open the socket (once) and say hello. Resolves when the server has accepted the session. */
  connect() {
    if (this.ready && this.ws && this.ws.readyState <= WebSocket.OPEN)
      return this.ready;
    const token = sessionToken();
    if (!token) return Promise.reject(new Error("Sign in to play online."));
    this.status = this.status === "idle" ? "connecting" : this.status;
    this.notify();
    const ws = new WebSocket(socketUrl());
    this.ws = ws;
    this.ready = new Promise<void>((resolve, reject) => {
      // Render's free plan can take half a minute to wake; say so instead of hanging.
      const timer = setTimeout(() => {
        reject(new Error("The match server is waking up. Try again."));
        ws.close();
      }, 40000);
      ws.onopen = () => ws.send(JSON.stringify({ t: "hello", token }));
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.t === "welcome") {
          clearTimeout(timer);
          this.retry = 0;
          resolve();
        }
        this.receive(m);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Unable to reach the match server."));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (this.ws !== ws) return;
        this.ws = null;
        this.ready = null;
        // A match survives a dropped connection: come back to the same seat.
        if (this.status === "playing") {
          const wait = Math.min(8000, 1000 * 2 ** this.retry++);
          setTimeout(() => {
            if (this.status === "playing") void this.connect().catch(() => {});
          }, wait);
        } else if (this.status === "queued" || this.status === "room") {
          this.status = "offline";
          this.error = "Connection lost. Search again.";
        }
        this.notify();
      };
    });
    return this.ready;
  }
  async queue(venueId: string) {
    this.reset();
    this.venueId = venueId;
    await this.connect();
    this.send({ t: "queue", venueId });
  }
  async createRoom(venueId: string) {
    this.reset();
    this.venueId = venueId;
    await this.connect();
    this.send({ t: "room", venueId });
  }
  async join(code: string) {
    this.reset();
    await this.connect();
    this.send({ t: "join", code: code.trim().toUpperCase() });
  }
  cancel() {
    this.send({ t: "cancel" });
    this.status = "idle";
    this.roomCode = "";
    this.notify();
  }
  resign() {
    this.send({ t: "resign" });
  }
  rematch() {
    this.rematchAsked = true;
    this.send({ t: "rematch" });
    this.notify();
  }
  emote(id: number) {
    this.send({ t: "emote", id });
    this.bubble = { mine: true, text: this.emotes[id] || "", at: Date.now() };
    this.notify();
  }
  /** Leave the table after a result (or abandon it from the menu, which resigns first). */
  leave() {
    if (this.status === "playing") this.resign();
    this.send({ t: "leave" });
    this.stopTable();
    this.reset();
  }
  private reset() {
    this.status = "idle";
    this.error = "";
    this.roomCode = "";
    this.match = null;
    this.result = null;
    this.opponentAwayUntil = 0;
    this.opponentLeft = false;
    this.rematchOffered = false;
    this.rematchAsked = false;
    this.bubble = null;
    this.notify();
  }
  private stopTable() {
    if (this.aimTimer) clearInterval(this.aimTimer);
    this.aimTimer = null;
    session.endOnline();
  }
  /** Seat the local player at the table. This device is always player 0 on screen. */
  private startTable(m: any, resume: boolean) {
    const mirror = m.seat === 1;
    this.match = {
      id: m.id,
      seat: m.seat,
      venue: m.venue,
      entry: m.entry,
      pot: m.pot,
      private: m.private,
      opponent: m.opponent,
      cues: m.cues,
      introUntil: Date.now() + (m.introMs || 0),
    };
    this.result = null;
    this.rematchAsked = this.rematchOffered = false;
    this.opponentAwayUntil = 0;
    this.status = "playing";
    session.endOnline();
    session.cpu = null;
    session.matchRules = true;
    session.cueIds = [m.cues[m.seat], m.cues[1 - m.seat]];
    session.skin = m.venue.skin;
    session.reset("break");
    session.remote = { ...m.opponent, seat: 1 - m.seat };
    if (resume && m.state) {
      session.localSeq = m.seq;
      session.loadTableState(m.state as TableState, mirror);
    } else {
      // Seat 0 breaks.
      session.progress.turn = m.seat === 0 ? 0 : 1;
      session.localSeq = 0;
    }
    // The first clock starts after the VS card, as the server's does.
    session.resetTurnClock();
    session.turnDeadline = Date.now() + (m.introMs || 0) + (m.turnMs || 0);
    session.onAction = (a: Action) => {
      if (a.t !== "timeout") this.send({ t: "act", action: a });
    };
    session.notify();
    if (this.aimTimer) clearInterval(this.aimTimer);
    // Ten aim updates a second is enough for the opponent's cue to glide.
    this.aimTimer = setInterval(() => {
      if (
        session.cpuTurn ||
        session.running ||
        session.placement ||
        this.status !== "playing"
      )
        return;
      const aim = [session.angle, session.power, session.side, session.top]
        .map((n) => n.toFixed(4))
        .join();
      if (aim === this.lastAim) return;
      this.lastAim = aim;
      this.send({
        t: "aim",
        angle: session.angle,
        power: session.power,
        side: session.side,
        top: session.top,
      });
    }, 100);
  }
  private receive(m: any) {
    switch (m.t) {
      case "welcome":
      case "pong":
        this.online = m.online;
        if (m.emotes) this.emotes = m.emotes;
        break;
      case "queued":
        this.status = "queued";
        this.online = m.online;
        break;
      case "room":
        this.status = "room";
        this.roomCode = m.code;
        this.venueId = m.venueId;
        break;
      case "cancelled":
        break;
      case "match":
        this.startTable(m, m.state !== undefined);
        break;
      case "act": {
        const mine = this.match && m.seat === this.match.seat && !m.auto;
        if (mine) session.confirmed.set(m.seq, m.state);
        else
          session.inbox.push({ seq: m.seq, action: m.action, state: m.state });
        break;
      }
      case "reject":
        // The server did not accept what this phone just played: adopt its table.
        session.inbox = session.inbox.filter((x) => x.seq > m.seq);
        session.confirmed.clear();
        session.localSeq = m.seq;
        session.loadTableState(m.state, this.match?.seat === 1);
        session.resetTurnClock();
        break;
      case "aim":
        session.remoteAim = {
          angle: m.angle,
          power: m.power,
          side: m.side,
          top: m.top,
        };
        break;
      case "emote":
        this.bubble = {
          mine: false,
          text: this.emotes[m.id] || "",
          at: Date.now(),
        };
        break;
      case "opponent":
        this.opponentAwayUntil =
          m.status === "away" ? Date.now() + m.returnMs : 0;
        break;
      case "end":
        this.status = "ended";
        this.stopTimersOnly();
        this.result = {
          won: m.winner !== null && m.winner === this.match?.seat,
          draw: m.winner === null,
          reason: m.reason,
          pot: m.pot,
          refunded: m.refunded,
          trophies: m.trophies,
          xp: m.xp,
          crate: m.crate,
          player: m.player,
          revealAt: Date.now() + (m.revealMs || 0),
        };
        this.opponentAwayUntil = 0;
        break;
      case "rematch":
        this.rematchOffered = true;
        break;
      case "left":
        this.opponentLeft = true;
        break;
      case "error":
        this.error = m.message;
        if (this.status === "connecting") this.status = "idle";
        break;
    }
    this.notify();
  }
  private stopTimersOnly() {
    if (this.aimTimer) clearInterval(this.aimTimer);
    this.aimTimer = null;
  }
}
export const online = new Online();
