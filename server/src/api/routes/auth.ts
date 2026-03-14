// File: server/src/api/routes/auth.ts

import { Router } from 'express';
import { z }      from 'zod';
import { UserRole, SkillTier } from '../../shared/types/user';
import { CoinTransactionType } from '../../shared/types/coin';
import { ELO_DEFAULT, MIN_AGE_YEARS, MIN_PASSWORD_LENGTH, MIN_USERNAME_LENGTH, MAX_USERNAME_LENGTH, DAILY_BONUS_COINS } from '../../shared/constants';
import { User } from '../../shared/models/User';
import { CoinTransaction } from '../../shared/models/CoinTransaction';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt';
import { sendSuccess, Errors } from '../../shared/utils/response';
import { requireAuth } from '../middleware/auth';
import { authLimiter, registrationLimiter } from '../middleware/rateLimiter';

export const authRouter = Router();

const registerSchema = z.object({
  username:    z.string().min(MIN_USERNAME_LENGTH).max(MAX_USERNAME_LENGTH).regex(/^[a-z0-9_]+$/i),
  email:       z.string().email(),
  password:    z.string().min(MIN_PASSWORD_LENGTH),
  displayName: z.string().min(1).max(32).trim(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  country:     z.string().length(2).toUpperCase(),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

function isAgeEligible(dob: string): boolean {
  const birth = new Date(dob);
  const now   = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const notYet = now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (notYet) age--;
  return age >= MIN_AGE_YEARS;
}

// POST /api/auth/register
authRouter.post('/register', registrationLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) { Errors.badRequest(res, 'Validation failed', parsed.error.flatten().fieldErrors); return; }

    const { username, email, password, displayName, dateOfBirth, country } = parsed.data;
    if (!isAgeEligible(dateOfBirth)) { Errors.forbidden(res, `You must be at least ${MIN_AGE_YEARS} to register.`); return; }

    const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] });
    if (exists) { Errors.conflict(res, exists.email === email.toLowerCase() ? 'Email already registered' : 'Username already taken'); return; }

    const user = new User({
      username: username.toLowerCase(), email: email.toLowerCase(),
      passwordHash: password, displayName, dateOfBirth, country,
      role: UserRole.PLAYER, ageVerifiedAt: new Date(),
      elo: { rating: ELO_DEFAULT, tier: SkillTier.BEGINNER, wins: 0, losses: 0, draws: 0, winStreak: 0, bestStreak: 0, tournamentsPlayed: 0, tournamentsWon: 0 },
      coinBalance: DAILY_BONUS_COINS,
      responsibleGaming: { last30DaySpendCents: 0, spendResetAt: new Date() },
    });
    await user.save();

    await CoinTransaction.create({
      userId: user._id, type: CoinTransactionType.DAILY_BONUS,
      amount: DAILY_BONUS_COINS, balanceAfter: DAILY_BONUS_COINS,
      description: 'Welcome bonus',
    });

    const tp = { userId: String(user._id), username: user.username, role: user.role };
    sendSuccess(res, {
      accessToken: signAccessToken(tp), refreshToken: signRefreshToken(tp),
      user: { _id: user._id, username: user.username, displayName: user.displayName, role: user.role, coinBalance: user.coinBalance, elo: user.elo, country: user.country },
    }, 201);
  } catch (err) { next(err); }
});

// POST /api/auth/login
authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) { Errors.badRequest(res, 'Invalid credentials'); return; }

    const { email, password } = parsed.data;
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user)          { Errors.unauthorized(res, 'Invalid email or password'); return; }
    if (user.isBanned)  { Errors.forbidden(res, `Account suspended${user.banReason ? ': ' + user.banReason : ''}`); return; }
    if (!user.isActive) { Errors.forbidden(res, 'Account is deactivated'); return; }

    const ok = await (user as unknown as { comparePassword(p: string): Promise<boolean> }).comparePassword(password);
    if (!ok) { Errors.unauthorized(res, 'Invalid email or password'); return; }

    const tp = { userId: String(user._id), username: user.username, role: user.role };
    sendSuccess(res, {
      accessToken: signAccessToken(tp), refreshToken: signRefreshToken(tp),
      user: { _id: user._id, username: user.username, displayName: user.displayName, role: user.role, coinBalance: user.coinBalance, elo: user.elo, country: user.country },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/refresh
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken: rt } = req.body as { refreshToken?: string };
    if (!rt) { Errors.badRequest(res, 'refreshToken required'); return; }
    const payload = verifyRefreshToken(rt);
    const user    = await User.findById(payload.userId);
    if (!user || user.isBanned || !user.isActive) { Errors.unauthorized(res, 'Token no longer valid'); return; }
    const tp = { userId: String(user._id), username: user.username, role: user.role };
    sendSuccess(res, { accessToken: signAccessToken(tp), refreshToken: signRefreshToken(tp) });
  } catch { Errors.unauthorized(res, 'Invalid or expired refresh token'); }
});

// POST /api/auth/logout
authRouter.post('/logout', requireAuth, (_req, res) => {
  sendSuccess(res, { message: 'Logged out successfully' });
});

// GET /api/users/me
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) { Errors.notFound(res, 'User'); return; }
    sendSuccess(res, {
      _id: user._id, username: user.username, displayName: user.displayName,
      email: user.email, role: user.role, avatarUrl: user.avatarUrl,
      country: user.country, coinBalance: user.coinBalance, elo: user.elo,
      kyc: { status: user.kyc.status },
      equippedCosmeticIds: user.equippedCosmeticIds,
    });
  } catch (err) { next(err); }
});
