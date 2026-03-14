// File: mobile/src/game/ColyseusClient.ts

import { Client, Room } from 'colyseus.js';
import Constants        from 'expo-constants';
import { getAccessToken } from '../api/client';
import { useGameStore }   from '../store/gameStore';
import { MatchState, BallState, PlayerState, MatchResult } from '../types/game';

const GAME_URL = (Constants.expoConfig?.extra?.['gameUrl'] as string | undefined)
  ?? 'ws://localhost:2567';

class ColyseusClient {
  private client: Client;
  private room:   Room | null = null;

  constructor() {
    this.client = new Client(GAME_URL);
  }

  // ── Join a specific room (post-matchmaking) ────────────────────────────────

  async joinRoom(roomId: string, roomType = 'match'): Promise<void> {
    const token = getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const store = useGameStore.getState();
    store.reset();
    store.setConnected(false);

    try {
      this.room = await this.client.joinById(roomId, { token });
    } catch {
      // Fallback: create a new room of given type
      this.room = await this.client.joinOrCreate(roomType, { token });
    }

    this.attachListeners();
    store.setConnected(true);
  }

  // ── Join matchmaking practice room directly ────────────────────────────────

  async joinPractice(): Promise<void> {
    const token = getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const store = useGameStore.getState();
    store.reset();

    this.room = await this.client.joinOrCreate('practice', { token });
    this.attachListeners();
    store.setConnected(true);
  }

  // ── Send a shot ────────────────────────────────────────────────────────────

  sendShot(input: Omit<import('../types/game').ShotInput, 'clientTimestamp'>): void {
    this.room?.send('shoot', { ...input, clientTimestamp: Date.now() });
  }

  // ── Place cue ball (ball-in-hand) ──────────────────────────────────────────

  placeBall(x: number, y: number): void {
    this.room?.send('place_ball', { x, y });
  }

  sendReady(): void {
    this.room?.send('ready');
  }

  // ── Leave ─────────────────────────────────────────────────────────────────

  async leave(): Promise<void> {
    await this.room?.leave();
    this.room = null;
    useGameStore.getState().reset();
  }

  // ── Colyseus state listeners ───────────────────────────────────────────────

  private attachListeners(): void {
    if (!this.room) return;
    const store = useGameStore.getState();

    // Full state sync on first join
    this.room.onStateChange((rawState: unknown) => {
      const state = rawState as MatchState & {
        players: Map<string, PlayerState>;
        balls:   { toArray?: () => BallState[] } & BallState[];
      };

      const players: Record<string, PlayerState> = {};
      state.players.forEach((p: PlayerState, id: string) => {
        players[id] = {
          userId:            p.userId,
          username:          p.username,
          displayName:       p.displayName,
          eloRating:         p.eloRating,
          isConnected:       p.isConnected,
          isReady:           p.isReady,
          ballGroup:         p.ballGroup as import('../types/game').BallGroup,
          ballsPocketed:     Array.from(p.ballsPocketed as unknown as Iterable<number>),
          turnTimeRemaining: p.turnTimeRemaining,
          totalTimeUsed:     p.totalTimeUsed,
        };
      });

      const balls: BallState[] = (
        typeof state.balls.toArray === 'function'
          ? state.balls.toArray()
          : Array.from(state.balls as unknown as Iterable<BallState>)
      ).map((b: BallState) => ({
        id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
        spin:       { x: b.spin.x, y: b.spin.y, z: b.spin.z },
        isPocketed: b.isPocketed,
        isMoving:   b.isMoving,
      }));

      store.setMatch({
        matchId:       state.matchId,
        status:        state.status        as import('../types/game').MatchStatus,
        turnPhase:     state.turnPhase     as import('../types/game').TurnPhase,
        currentTurn:   state.currentTurn,
        breakPlayerId: state.breakPlayerId,
        shotCount:     state.shotCount,
        isBallInHand:  state.isBallInHand,
        isBreakShot:   state.isBreakShot,
        countdown:     state.countdown,
        winnerId:      state.winnerId,
        winReason:     state.winReason,
        players,
        balls,
      });
    });

    this.room.onMessage('foul', (data: { type: string }) => {
      store.setFoul(data.type);
      setTimeout(() => store.setFoul(null), 3_000);
    });

    this.room.onMessage('match_result', (result: MatchResult) => {
      store.setMatchResult(result);
    });

    this.room.onMessage('shot_rejected', (data: { reason: string }) => {
      store.setError(`Shot rejected: ${data.reason}`);
      setTimeout(() => store.setError(null), 2_000);
    });

    this.room.onError((code: number, msg?: string) => {
      store.setError(`Room error ${code}: ${msg ?? ''}`);
    });

    this.room.onLeave(() => {
      store.setConnected(false);
    });
  }
}

// Singleton
export const colyseusClient = new ColyseusClient();
