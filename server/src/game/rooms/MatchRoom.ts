// File: server/src/game/rooms/MatchRoom.ts

import { Room, Client }      from 'colyseus';
import jwt                   from 'jsonwebtoken';
import { MatchStatus, TurnPhase, ShotInput } from '../../shared/types/game';
import { AuthTokenPayload }  from '../../shared/types/user';
import {
  DISCONNECT_GRACE_SECONDS, COUNTDOWN_SECONDS, TURN_TIME_SECONDS, WIN_REWARD_COINS,
} from '../../shared/constants';
import { env }               from '../../shared/config/env';
import { MatchState, buildInitialMatchState, rackBalls } from './schema/MatchState';
import { PlayerState }       from './schema/PlayerState';
import { BallState as BallSchema } from './schema/BallState';
import { processShot, snapshotBalls, applyResultToBalls, ShotResult } from '../../shared/physics';
import { Match, IShotRecord } from '../../shared/models/Match';
import { User }               from '../../shared/models/User';
import { CoinTransaction }    from '../../shared/models/CoinTransaction';
import { CoinTransactionType } from '../../shared/types/coin';
import { calculateEloChange, getTierFromRating } from '../../shared/utils/elo';

interface JoinOptions { token: string; tournamentId?: string }
interface RoomOptions { isRanked?: boolean; isTournament?: boolean }

// Per-player runtime data (not in Colyseus schema — server only)
interface PlayerMeta {
  userId:    string;
  username:  string;
  eloRating: number;
  gamesPlayed: number;
}

export class MatchRoom extends Room<MatchState> {
  maxClients = 2;

  private turnTimer:        ReturnType<typeof setInterval>  | null = null;
  private countdownTimer:   ReturnType<typeof setInterval>  | null = null;
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Server-side metadata not exposed to clients
  private playerMeta: Map<string, PlayerMeta> = new Map();
  private shotLog:    IShotRecord[]             = [];
  private isRanked  = true;

  // ── onCreate ───────────────────────────────────────────────────────────────

  onCreate(options: RoomOptions): void {
    this.isRanked               = options.isRanked ?? true;
    const state                 = buildInitialMatchState(this.roomId);
    state.isTournamentMatch     = options.isTournament ?? false;
    this.setState(state);

    this.onMessage('shoot',      this.handleShoot.bind(this));
    this.onMessage('place_ball', this.handlePlaceBall.bind(this));
    this.onMessage('ready',      this.handleReady.bind(this));

    this.clock.setTimeout(() => {
      if (this.state.status === MatchStatus.WAITING && this.clients.length === 0) {
        this.disconnect();
      }
    }, 30_000);
  }

  // ── onAuth ─────────────────────────────────────────────────────────────────

  onAuth(_client: Client, options: JoinOptions): AuthTokenPayload {
    if (!options.token) throw new Error('Token required');
    try {
      return jwt.verify(options.token, env.JWT_ACCESS_SECRET) as AuthTokenPayload;
    } catch {
      throw new Error('Invalid or expired token');
    }
  }

  // ── onJoin ─────────────────────────────────────────────────────────────────

  async onJoin(client: Client, _options: JoinOptions, auth?: AuthTokenPayload): Promise<void> {
    if (!auth) throw new Error('Missing auth payload');
    const { userId, username } = auth;

    const timer = this.disconnectTimers.get(userId);
    if (timer) { clearTimeout(timer); this.disconnectTimers.delete(userId); }

    const existing = this.state.players.get(userId);
    if (existing) {
      existing.isConnected = true;
      if (this.state.status === MatchStatus.PAUSED) this.state.status = MatchStatus.IN_PROGRESS;
      client.send('reconnected', {});
      return;
    }

    // Load user ELO from DB
    const dbUser = await User.findById(userId).select('elo').lean();
    const eloRating   = dbUser?.elo?.rating    ?? 1000;
    const gamesPlayed = (dbUser?.elo?.wins ?? 0) + (dbUser?.elo?.losses ?? 0);

    this.playerMeta.set(userId, { userId, username, eloRating, gamesPlayed });

    const p = new PlayerState();
    p.userId = userId; p.username = username; p.displayName = username;
    p.eloRating = eloRating;
    p.isConnected = true; p.turnTimeRemaining = TURN_TIME_SECONDS;
    this.state.players.set(userId, p);

    if (this.state.players.size === 2) await this.startCountdown();
  }

  // ── onLeave ────────────────────────────────────────────────────────────────

  onLeave(client: Client, consented: boolean): void {
    const userId = this.getUserId(client);
    if (!userId) return;
    const player = this.state.players.get(userId);
    if (!player) return;

    player.isConnected = false;

    if (this.state.status === MatchStatus.IN_PROGRESS) {
      this.state.status = MatchStatus.PAUSED;
      const t = setTimeout(() => {
        if (!player.isConnected) {
          const other = this.getOtherId(userId);
          if (other) this.endMatch(other, 'opponent_disconnect');
        }
        this.disconnectTimers.delete(userId);
      }, DISCONNECT_GRACE_SECONDS * 1_000);
      this.disconnectTimers.set(userId, t);
    }

    if (consented && this.state.status === MatchStatus.WAITING) {
      this.state.players.delete(userId);
    }
  }

  onDispose(): void { this.clearAll(); }

  // ── Message: ready ─────────────────────────────────────────────────────────

  private handleReady(client: Client): void {
    const p = this.state.players.get(this.getUserId(client) ?? '');
    if (p) p.isReady = true;
  }

  // ── Message: shoot ─────────────────────────────────────────────────────────

  private handleShoot(client: Client, raw: unknown): void {
    const userId = this.getUserId(client);
    if (!userId) return;
    if (!this.isValidTurn(userId))                 { client.send('shot_rejected', { reason: 'not_your_turn' }); return; }
    if (this.state.turnPhase !== TurnPhase.AIMING) { client.send('shot_rejected', { reason: 'shot_already_pending' }); return; }

    const input = this.parseShot(raw);
    if (!input) { client.send('shot_rejected', { reason: 'invalid_input' }); return; }

    this.clearTurnTimer();
    this.state.turnPhase = TurnPhase.SHOT_PENDING;
    this.state.shotCount++;
    client.send('shot_accepted', { shotIndex: this.state.shotCount });

    // Server-authoritative physics
    const snapshots = snapshotBalls(this.state.balls);
    const result    = processShot(snapshots, input);
    applyResultToBalls(result, Array.from(this.state.balls) as BallSchema[]);

    // Log shot for replay + anti-cheat
    this.shotLog.push({
      shotIndex:     this.state.shotCount,
      playerId:      userId,
      aimAngle:      input.aimAngle,
      power:         input.power,
      spinX:         input.spinX,
      spinY:         input.spinY,
      cueBallX:      input.cueBallX,
      cueBallY:      input.cueBallY,
      foulCommitted: !!result.foul,
      foulType:      result.foul?.type,
      ballsPocketed: result.pocketed,
      timestamp:     input.clientTimestamp,
    });

    this.state.turnPhase = TurnPhase.RESOLVING;
    this.resolveShot(userId, result);
  }

  // ── Message: place_ball ────────────────────────────────────────────────────

  private handlePlaceBall(client: Client, data: { x: number; y: number }): void {
    const userId = this.getUserId(client);
    if (!userId || !this.state.isBallInHand || !this.isValidTurn(userId)) return;
    const cue = this.state.balls.find(b => b.id === 0);
    if (!cue) return;
    cue.x = data.x; cue.y = data.y;
    this.state.isBallInHand = false;
    this.state.turnPhase    = TurnPhase.AIMING;
    this.startTurnTimer(userId);
  }

  // ── Shot resolution — 8-ball rules ────────────────────────────────────────

  private resolveShot(shooterId: string, result: ShotResult): void {
    const shooter = this.state.players.get(shooterId);
    const otherId = this.getOtherId(shooterId);
    if (!shooter || !otherId) return;

    const eightBallPocketed = result.pocketed.includes(8);

    if (result.foul) {
      if (eightBallPocketed) { this.endMatch(otherId, 'foul_on_8ball'); return; }
      this.state.isBallInHand = true;
      this.broadcast('foul', { type: result.foul.type, nextPlayer: otherId });
      this.switchTurn(otherId);
      return;
    }

    if (eightBallPocketed) { this.endMatch(shooterId, 'pocketed_8ball'); return; }

    // Assign ball groups on first pocket after break
    if (!shooter.ballGroup && result.pocketed.length > 0) {
      const solids  = result.pocketed.filter(id => id >= 1 && id <= 7).length;
      const stripes = result.pocketed.filter(id => id >= 9 && id <= 15).length;
      const otherPlayer = this.state.players.get(otherId);
      if (solids > stripes) {
        shooter.ballGroup = 'solids';
        if (otherPlayer) otherPlayer.ballGroup = 'stripes';
      } else if (stripes > 0) {
        shooter.ballGroup = 'stripes';
        if (otherPlayer) otherPlayer.ballGroup = 'solids';
      }
    }

    for (const id of result.pocketed) {
      if (!shooter.ballsPocketed.includes(id)) shooter.ballsPocketed.push(id);
    }

    const myBalls = result.pocketed.filter(id => {
      if (shooter.ballGroup === 'solids')  return id >= 1 && id <= 7;
      if (shooter.ballGroup === 'stripes') return id >= 9 && id <= 15;
      return id !== 8;
    });

    if (myBalls.length > 0) {
      this.state.isBreakShot = false;
      this.state.turnPhase   = TurnPhase.AIMING;
      this.startTurnTimer(shooterId);
    } else {
      this.state.isBreakShot = false;
      this.switchTurn(otherId);
    }
  }

  // ── Game flow ──────────────────────────────────────────────────────────────

  private async startCountdown(): Promise<void> {
    // Create match record in DB
    const ids     = Array.from(this.state.players.keys());
    const p1Id    = ids[0]!;
    const p2Id    = ids[1]!;
    const p1Meta  = this.playerMeta.get(p1Id);
    const p2Meta  = this.playerMeta.get(p2Id);

    await Match.create({
      roomId:           this.roomId,
      isRanked:         this.isRanked,
      isTournament:     this.state.isTournamentMatch,
      player1Id:        p1Id,
      player2Id:        p2Id,
      player1EloBefore: p1Meta?.eloRating ?? 0,
      player2EloBefore: p2Meta?.eloRating ?? 0,
      status:           'in_progress',
    });

    this.state.status    = MatchStatus.COUNTDOWN;
    this.state.countdown = COUNTDOWN_SECONDS;
    rackBalls(this.state);
    this.state.breakPlayerId = ids[Math.floor(Math.random() * 2)] ?? '';
    this.state.currentTurn   = this.state.breakPlayerId;
    this.state.isBreakShot   = true;

    this.countdownTimer = setInterval(() => {
      this.state.countdown--;
      if (this.state.countdown <= 0) {
        clearInterval(this.countdownTimer!);
        this.countdownTimer = null;
        this.startMatch();
      }
    }, 1_000);
  }

  private startMatch(): void {
    this.state.status    = MatchStatus.IN_PROGRESS;
    this.state.turnPhase = TurnPhase.AIMING;
    this.state.startedAt = Date.now();
    this.startTurnTimer(this.state.currentTurn);
  }

  private startTurnTimer(userId: string): void {
    const p = this.state.players.get(userId);
    if (!p) return;
    p.turnTimeRemaining = TURN_TIME_SECONDS;
    this.turnTimer = setInterval(() => {
      if (p.turnTimeRemaining > 0) { p.turnTimeRemaining--; p.totalTimeUsed++; }
      else {
        this.clearTurnTimer();
        this.state.isBallInHand = true;
        const other = this.getOtherId(userId);
        if (other) this.switchTurn(other);
      }
    }, 1_000);
  }

  private switchTurn(nextId: string): void {
    this.clearTurnTimer();
    this.state.currentTurn  = nextId;
    this.state.isBallInHand = false;
    this.state.turnPhase    = TurnPhase.AIMING;
    this.startTurnTimer(nextId);
  }

  // ── End match + persist ────────────────────────────────────────────────────

  private endMatch(winnerId: string, reason: string): void {
    this.state.status     = MatchStatus.FINISHED;
    this.state.winnerId   = winnerId;
    this.state.winReason  = reason;
    this.state.finishedAt = Date.now();
    this.clearAll();

    const loserId    = this.getOtherId(winnerId) ?? '';
    const durationMs = this.state.startedAt > 0
      ? this.state.finishedAt - this.state.startedAt
      : 0;

    this.broadcast('match_result', {
      matchId: this.state.matchId, winnerId, loserId,
      winReason: reason, shotCount: this.state.shotCount, durationMs,
    });

    // Persist result + update ELO/coins asynchronously
    this.persistResult(winnerId, loserId, reason, durationMs).catch(err =>
      console.error('[MatchRoom] persistResult error:', err));

    this.clock.setTimeout(() => this.disconnect(), 10_000);
  }

  private async persistResult(
    winnerId: string, loserId: string, reason: string, durationMs: number,
  ): Promise<void> {
    const winnerMeta = this.playerMeta.get(winnerId);
    const loserMeta  = this.playerMeta.get(loserId);
    if (!winnerMeta || !loserMeta) return;

    let winnerEloDelta = 0, loserEloDelta = 0;
    let winnerNewElo   = winnerMeta.eloRating;
    let loserNewElo    = loserMeta.eloRating;

    if (this.isRanked) {
      const eloResult = calculateEloChange(
        winnerMeta.eloRating, loserMeta.eloRating,
        winnerMeta.gamesPlayed, loserMeta.gamesPlayed,
      );
      winnerNewElo   = eloResult.winnerNewRating;
      loserNewElo    = eloResult.loserNewRating;
      winnerEloDelta = eloResult.winnerDelta;
      loserEloDelta  = eloResult.loserDelta;
    }

    const winnerCoins = WIN_REWARD_COINS;

    // Update winner
    await User.findByIdAndUpdate(winnerId, {
      $inc: { 'elo.wins': 1, 'elo.winStreak': 1, coinBalance: winnerCoins },
      $set: { 'elo.rating': winnerNewElo, 'elo.tier': getTierFromRating(winnerNewElo) },
    });

    // Update loser
    await User.findByIdAndUpdate(loserId, {
      $inc: { 'elo.losses': 1 },
      $set: { 'elo.rating': loserNewElo, 'elo.tier': getTierFromRating(loserNewElo), 'elo.winStreak': 0 },
    });

    // Coin reward for winner
    const winnerDoc = await User.findById(winnerId).select('coinBalance').lean();
    if (winnerDoc) {
      await CoinTransaction.create({
        userId:      winnerId,
        type:        CoinTransactionType.WIN_REWARD,
        amount:      winnerCoins,
        balanceAfter: (winnerDoc.coinBalance ?? 0) + winnerCoins,
        description: `Win reward — match ${this.roomId}`,
        referenceId:  this.roomId,
      });
    }

    // Persist final match record
    await Match.findOneAndUpdate(
      { roomId: this.roomId },
      {
        winnerId, loserId, winReason: reason,
        status: 'finished',
        finishedAt: new Date(),
        durationMs,
        shotCount: this.state.shotCount,
        player1EloAfter:  winnerId === (Array.from(this.state.players.keys())[0] ?? '') ? winnerNewElo  : loserNewElo,
        player2EloAfter:  winnerId === (Array.from(this.state.players.keys())[0] ?? '') ? loserNewElo   : winnerNewElo,
        player1EloDelta:  winnerId === (Array.from(this.state.players.keys())[0] ?? '') ? winnerEloDelta : loserEloDelta,
        player2EloDelta:  winnerId === (Array.from(this.state.players.keys())[0] ?? '') ? loserEloDelta  : winnerEloDelta,
        player1CoinsAwarded: winnerId === (Array.from(this.state.players.keys())[0] ?? '') ? winnerCoins : 0,
        player2CoinsAwarded: winnerId === (Array.from(this.state.players.keys())[1] ?? '') ? winnerCoins : 0,
        shots: this.shotLog,
      },
    );

    console.log(`[MatchRoom] ${this.roomId} persisted — winner: ${winnerId} (+${winnerEloDelta} ELO)`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private isValidTurn(userId: string): boolean {
    return this.state.status === MatchStatus.IN_PROGRESS && this.state.currentTurn === userId;
  }

  private getUserId(client: Client): string | null {
    return ((client as unknown as { auth?: AuthTokenPayload }).auth)?.userId ?? null;
  }

  private getOtherId(userId: string): string | null {
    for (const [id] of this.state.players) if (id !== userId) return id;
    return null;
  }

  private parseShot(raw: unknown): ShotInput | null {
    if (typeof raw !== 'object' || !raw) return null;
    const r     = raw as Record<string, unknown>;
    const angle = Number(r['aimAngle']);
    const power = Number(r['power']);
    const spinX = Number(r['spinX'] ?? 0);
    const spinY = Number(r['spinY'] ?? 0);
    if (isNaN(angle) || isNaN(power) || power < 0 || power > 1) return null;
    if (Math.abs(spinX) > 1 || Math.abs(spinY) > 1) return null;
    return { aimAngle: angle, power, spinX, spinY, clientTimestamp: Date.now() };
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) { clearInterval(this.turnTimer); this.turnTimer = null; }
  }

  private clearAll(): void {
    this.clearTurnTimer();
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.disconnectTimers.clear();
  }
}
