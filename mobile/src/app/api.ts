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
};
const host =
  Platform.OS === "web"
    ? typeof location !== "undefined"
      ? location.hostname
      : "localhost"
    : Constants.expoConfig?.hostUri?.split(":")[0] ||
      (Platform.OS === "android" ? "10.0.2.2" : "localhost");
export const API = process.env.EXPO_PUBLIC_API_URL || `http://${host}:4000`;
let token: string | null = null;
const storage = {
  get: () =>
    Platform.OS === "web"
      ? AsyncStorage.getItem("cuemaster.session")
      : SecureStore.getItemAsync("cuemaster.session"),
  set: (v: string) =>
    Platform.OS === "web"
      ? AsyncStorage.setItem("cuemaster.session", v)
      : SecureStore.setItemAsync("cuemaster.session", v),
  remove: () =>
    Platform.OS === "web"
      ? AsyncStorage.removeItem("cuemaster.session")
      : SecureStore.deleteItemAsync("cuemaster.session"),
};
export async function restoreToken() {
  token = await storage.get();
  return token;
}
export async function saveToken(v: string) {
  await storage.set(v);
  token = v;
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
    const data = await response
      .json()
      .catch(() => ({
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
