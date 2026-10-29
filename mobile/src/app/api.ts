import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
export type Player = {
  id: string;
  name: string;
  country: string;
  avatar: number;
  guest: boolean;
  providers: string[];
  xp: number;
  level: number;
  coins: number;
  rubies?: number;
  trophies?: number;
  crates?: number;
  ownedCues?: string[];
  selectedCue?: string;
  completed: string[];
  selectedTable: string;
  /** The one-time starter pack has been bought. */
  starterBought?: boolean;
  /** The season id whose premium pass this player owns, if any. */
  passPremiumSeason?: number | null;
  stats: {
    finishes: number;
    shots: number;
    cpuMatches?: number;
    cpuWins?: number;
    cpuLosses?: number;
    cpuStreak?: number;
    bestStreak?: number;
    localMatches?: number;
    localWins?: number;
    localLosses?: number;
    worstStreak?: number;
    coinsWon?: number;
    cratesOpened?: number;
    onlineMatches?: number;
    onlineWins?: number;
    onlineLosses?: number;
  };
};
export type Venue = {
  id: string;
  name: string;
  subtitle: string;
  level: number;
  skin: number;
  entry: number;
  mood: string;
};
export type Challenge = {
  id: string;
  name: string;
  drill: string;
  description: string;
  targets: number[];
  xp: number;
  coins: number;
  difficulty: string;
  /** Venue id for city trick-shot packs. */
  city?: string;
};
export type Tournament = {
  id: string;
  name: string;
  kind: string;
  status: string;
  subtitle: string;
  description: string;
  level: number;
  entry: number;
  reward: number;
  currency: string;
  prize: string;
  rules: string[];
  drill?: string;
  targets?: number[];
};
export type Catalog = {
  venues: Venue[];
  challenges: Challenge[];
  cityChallenges: Challenge[];
  tournaments: Tournament[];
};
export type LeaderReplay = {
  name: string;
  shots: { angle: number; power: number; side: number; top: number }[];
};
/** A daily reward. A crate is named by type only; what it holds is rolled when it opens. */
export type DailyReward = {
  coins: number;
  rubies: number;
  /** `fallbackCoins` is paid instead when every crate slot is full. */
  crate: { tier: string; name: string; fallbackCoins: number } | null;
};
/** What a claim actually paid. `fallback` is a crate that became coins because the slots were full. */
export type Granted = {
  coins: number;
  rubies: number;
  crate: { tier: string; name: string } | null;
  fallback: { tier: string; name: string; coins: number } | null;
  passXp: number;
};
export type DailyMission = {
  id: string;
  label: string;
  goal: number;
  progress: number;
  reward: DailyReward;
  passXp: number;
  claimed: boolean;
};
export type WheelSegment = DailyReward & { label: string; jackpot: boolean };
/** `GET /me/today`: everything the daily screens draw, in one answer. */
export type Today = {
  date: string;
  resetsAt: string;
  slots: { held: number; max: number };
  streak: { day: number; claimedToday: boolean; rewards: DailyReward[] };
  /** `readyAt` is null when the gift can be collected now. */
  gift: { coins: number; hours: number; readyAt: string | null };
  spin: {
    free: number;
    tokens: number;
    adSpinsLeft: number;
    ads: boolean;
    segments: WheelSegment[];
  };
  /** The Lucky Shot: rings innermost first, `radius` in metres on the table. */
  lucky: {
    free: number;
    tokens: number;
    adShotsLeft: number;
    ads: boolean;
    rings: (DailyReward & { radius: number; label: string })[];
  };
  missions: {
    list: DailyMission[];
    bonus: {
      reward: DailyReward;
      passXp: number;
      ready: boolean;
      claimed: boolean;
    };
  };
  pass: {
    season: number;
    endsAt: string;
    xp: number;
    tier: number;
    xpPerTier: number;
    premium: boolean;
    rewards: {
      tier: number;
      xp: number;
      free: DailyReward;
      premium: DailyReward;
    }[];
    claimed: { free: number[]; premium: number[] };
  };
};
/** Every daily claim answers with the new balance and the whole board. */
export type DailyClaim = { player: Player; today: Today; granted: Granted };
export type SpinResult = DailyClaim & { index: number; prize: WheelSegment };
/** `POST /me/lucky`: where the referee's replay left the cue ball, and what that ring paid. */
export type LuckyResult = DailyClaim & {
  ring: number;
  landing: { x: number; z: number; pocketed: boolean };
  prize: (DailyReward & { label: string }) | null;
};
export const todayKey = () => new Date().toISOString().slice(0, 10);
/** A two-letter country code as its flag emoji; a neutral mark when unset. */
export function flag(code: string) {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => c.charCodeAt(0) + 127397))
    : "◎";
}
export type ProviderConfig = {
  google: boolean;
  googleWebClientId: string;
  apple: boolean;
  cashPayouts: boolean;
  onlineMatchmaking?: boolean;
  legal?: boolean;
  rubyStore?: boolean;
  urls?: {
    privacy: string;
    terms: string;
    support: string;
    deleteAccount: string;
    odds?: string;
  };
};
const host =
  Platform.OS === "web"
    ? typeof location !== "undefined"
      ? location.hostname
      : "localhost"
    : Constants.expoConfig?.hostUri?.split(":")[0] ||
      (Platform.OS === "android" ? "10.0.2.2" : "localhost");
export const API = (
  process.env.EXPO_PUBLIC_API_URL?.trim() || `http://${host}:4000`
).replace(/\/+$/, "");
// iOS App Transport Security blocks cleartext HTTP, and a release build pointing at a developer
// machine is the single most common cause of a "cannot connect" review rejection. Fail loudly.
export const insecureApi = !__DEV__ && !API.startsWith("https://");
let token: string | null = null;
/**
 * Session storage.
 *
 * The keychain can fail for reasons that have nothing to do with the player: a device restored
 * from backup, a locked keychain, a build without the entitlement. None of those mean the app
 * is broken — they mean "not signed in". Every call is therefore best-effort, and a failure to
 * read is indistinguishable from an empty slot.
 */
const KEY = "cuemaster.session";
const secure = Platform.OS !== "web";
const storage = {
  get: async () => {
    try {
      return secure
        ? await SecureStore.getItemAsync(KEY)
        : await AsyncStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: async (v: string) => {
    try {
      if (secure) await SecureStore.setItemAsync(KEY, v);
      else await AsyncStorage.setItem(KEY, v);
      return true;
    } catch {
      // The session still works for this run; it just will not survive a restart.
      return false;
    }
  },
  remove: async () => {
    try {
      if (secure) await SecureStore.deleteItemAsync(KEY);
      else await AsyncStorage.removeItem(KEY);
    } catch {}
  },
};
/** The live socket authenticates with the same session token as every request. */
export const sessionToken = () => token;
export async function restoreToken() {
  token = await storage.get();
  return token;
}
export async function saveToken(v: string) {
  token = v;
  return storage.set(v);
}
export async function clearToken() {
  token = null;
  await storage.remove();
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
  timeoutMs = 18000,
): Promise<T> {
  if (insecureApi)
    throw new Error(
      "This build is not configured with a secure server address. Set EXPO_PUBLIC_API_URL to the HTTPS backend before release.",
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => ({
      error:
        response.status === 429
          ? "Too many requests. Please wait a moment before trying again."
          : "The server could not complete this request. Try again.",
    }));
    if (!response.ok)
      throw new ApiError(data.error || "Request failed.", response.status);
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new Error(
      controller.signal.aborted
        ? "CueMaster is taking too long to respond. The server may be waking up; please try again."
        : "Unable to reach CueMaster. Check the connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
