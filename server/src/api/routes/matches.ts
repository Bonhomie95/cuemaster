// File: server/src/api/routes/matches.ts

import { Router } from 'express';
import { matchmakingQueue } from '../../game/matchmaking/queue';
import { Match }            from '../../shared/models/Match';
import { User }             from '../../shared/models/User';
import { requireAuth }      from '../middleware/auth';
import { sendSuccess, Errors } from '../../shared/utils/response';

export const matchesRouter = Router();

// ── POST /api/matches/queue — join matchmaking ─────────────────────────────

matchesRouter.post('/queue', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const dbUser = await User.findById(userId).select('elo isBanned').lean();
    if (!dbUser)        { Errors.notFound(res, 'User'); return; }
    if (dbUser.isBanned){ Errors.forbidden(res, 'Account suspended'); return; }

    const eloRating = dbUser.elo?.rating ?? 1000;

    // Returns when a match is found (or rejects on timeout)
    const roomId = await matchmakingQueue.enqueue(
      userId, req.user!.username, eloRating,
    );

    sendSuccess(res, { roomId, message: 'Match found' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Matchmaking timed out') {
      Errors.badRequest(res, 'No opponent found. Try again.');
      return;
    }
    next(err);
  }
});

// ── DELETE /api/matches/queue — leave queue ────────────────────────────────

matchesRouter.delete('/queue', requireAuth, (req, res) => {
  matchmakingQueue.dequeue(req.user!.userId);
  sendSuccess(res, { message: 'Removed from queue' });
});

// ── GET /api/matches/queue/status — queue size ────────────────────────────

matchesRouter.get('/queue/status', requireAuth, (_req, res) => {
  sendSuccess(res, { playersInQueue: matchmakingQueue.size() });
});

// ── GET /api/matches/:matchId — single match detail ───────────────────────

matchesRouter.get('/:matchId', requireAuth, async (req, res, next) => {
  try {
    const match = await Match.findOne({ roomId: req.params['matchId'] }).lean();
    if (!match) { Errors.notFound(res, 'Match'); return; }

    // Only participants can see the shot log
    const userId = req.user!.userId;
    const isParticipant =
      match.player1Id.toString() === userId ||
      match.player2Id.toString() === userId;

    sendSuccess(res, {
      roomId:      match.roomId,
      status:      match.status,
      player1Id:   match.player1Id,
      player2Id:   match.player2Id,
      winnerId:    match.winnerId,
      winReason:   match.winReason,
      shotCount:   match.shotCount,
      durationMs:  match.durationMs,
      player1EloBefore: match.player1EloBefore,
      player2EloBefore: match.player2EloBefore,
      player1EloAfter:  match.player1EloAfter,
      player2EloAfter:  match.player2EloAfter,
      player1EloDelta:  match.player1EloDelta,
      player2EloDelta:  match.player2EloDelta,
      startedAt:   match.startedAt,
      finishedAt:  match.finishedAt,
      shots:       isParticipant ? match.shots : undefined,
    });
  } catch (err) { next(err); }
});

// ── GET /api/matches/history/:userId — match history ─────────────────────

matchesRouter.get('/history/:userId', requireAuth, async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query['page']  ?? '1'),  10));
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20'), 10));

    const matches = await Match.find({
      $or: [{ player1Id: req.params['userId'] }, { player2Id: req.params['userId'] }],
      status: 'finished',
    })
      .sort({ finishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-shots')  // exclude shot log from list view
      .lean();

    sendSuccess(res, { matches, page, limit });
  } catch (err) { next(err); }
});
