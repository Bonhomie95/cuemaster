// File: server/src/game/matchmaking/queue.ts
//
// In-memory matchmaking queue.
// Players enter with their ELO rating. Initial search window is ±100 ELO,
// expanding by 50 every 10 seconds until a match is found.

interface QueueEntry {
  userId:      string;
  username:    string;
  eloRating:   number;
  joinedAt:    number;       // ms timestamp
  roomPromise: {
    resolve: (roomId: string) => void;
    reject:  (err: Error)    => void;
  };
}

const INITIAL_BAND    = 100;   // ±ELO
const BAND_EXPANSION  = 50;    // added per interval
const EXPAND_INTERVAL = 10_000; // ms
const MAX_WAIT_MS     = 120_000; // 2 minutes before timeout

class MatchmakingQueue {
  private queue: QueueEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  enqueue(userId: string, username: string, eloRating: number): Promise<string> {
    // Remove any stale entry for this user
    this.dequeue(userId);

    return new Promise<string>((resolve, reject) => {
      const entry: QueueEntry = {
        userId, username, eloRating,
        joinedAt: Date.now(),
        roomPromise: { resolve, reject },
      };
      this.queue.push(entry);

      if (!this.timer) {
        this.timer = setInterval(() => this.tick(), 1_000);
      }
    });
  }

  dequeue(userId: string): void {
    const idx = this.queue.findIndex(e => e.userId === userId);
    if (idx >= 0) this.queue.splice(idx, 1);
    if (this.queue.length === 0) this.stopTimer();
  }

  size(): number { return this.queue.length; }

  private tick(): void {
    const now = Date.now();

    // Expire timed-out entries
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const entry = this.queue[i]!;
      if (now - entry.joinedAt > MAX_WAIT_MS) {
        entry.roomPromise.reject(new Error('Matchmaking timed out'));
        this.queue.splice(i, 1);
      }
    }

    if (this.queue.length < 2) return;

    // Try to pair entries
    const paired = new Set<string>();

    for (let i = 0; i < this.queue.length; i++) {
      const a = this.queue[i]!;
      if (paired.has(a.userId)) continue;

      for (let j = i + 1; j < this.queue.length; j++) {
        const b = this.queue[j]!;
        if (paired.has(b.userId)) continue;

        const waitA = now - a.joinedAt;
        const waitB = now - b.joinedAt;
        const bandA = INITIAL_BAND + Math.floor(waitA / EXPAND_INTERVAL) * BAND_EXPANSION;
        const bandB = INITIAL_BAND + Math.floor(waitB / EXPAND_INTERVAL) * BAND_EXPANSION;
        const band  = Math.max(bandA, bandB);

        if (Math.abs(a.eloRating - b.eloRating) <= band) {
          // Match found — generate a room ID; actual room created by caller
          const roomId = `match_${a.userId}_${b.userId}_${now}`;
          paired.add(a.userId);
          paired.add(b.userId);
          a.roomPromise.resolve(roomId);
          b.roomPromise.resolve(roomId);
          break;
        }
      }
    }

    // Remove paired entries
    this.queue = this.queue.filter(e => !paired.has(e.userId));

    if (this.queue.length === 0) this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

// Singleton — one queue per server process
export const matchmakingQueue = new MatchmakingQueue();
