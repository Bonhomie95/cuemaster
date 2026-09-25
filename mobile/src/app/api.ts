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
  crates?: number;
  ownedCues?: string[];
  selectedCue?: string;
  completed: string[];
  selectedTable: string;
  stats: {
    finishes: number;
    shots: number;
    cpuMatches?: number;
    cpuWins?: number;
    cpuLosses?: number;
    cpuStreak?: number;
    localMatches?: number;
    localWins?: number;
    localLosses?: number;
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
};
export type Catalog = {
  venues: Venue[];
  challenges: Challenge[];
  tournaments: Tournament[];
};
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
  };
};
const host =
  Platform.OS === "web"
    ? typeof location !== "undefined"
      ? location.hostname
      : "localhost"
    : Constants.expoConfig?.hostUri?.split(":")[0] ||
      (Platform.OS === "android" ? "10.0.2.2" : "localhost");
export const API = process.env.EXPO_PUBLIC_API_URL || `http://${host}:4000`;
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
      "Unable to reach CueMaster. Check the connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
