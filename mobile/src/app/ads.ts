import { useEffect, useReducer } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./api";

/**
 * Rewarded video.
 *
 * The advert is shown here, but nothing is granted here: the server issues a ticket, the ticket
 * travels to AdMob as the SSV user id, and AdMob's signed callback is what actually takes the
 * hour off the crate or adds the extra spin. That means a modified app cannot award itself
 * anything.
 *
 * A video is loaded ahead of time for the purpose on screen (`useVideo`), so its button appears
 * only once it can play at the first tap: no "loading" state, no "no video" error. The ticket is
 * drawn first, and the server refuses one when the day's videos are used, so a spent purpose
 * simply shows no button.
 *
 * Ad identifiers come from the Expo config, which defaults to Google's public test units.
 */
const unit = () => {
  const admob = (Constants.expoConfig?.extra as any)?.admob || {};
  return Platform.OS === "ios" ? admob.iosRewarded : admob.androidRewarded;
};

export type RewardOutcome = "granted" | "dismissed" | "unavailable";
/** What a video pays for: an hour off a started crate, one extra spin or Lucky Shot, or coins. */
export type RewardFor =
  | { crateId: string }
  | { purpose: "spin" }
  | { purpose: "lucky" }
  | { purpose: "coins" };

const keyOf = (t: RewardFor) =>
  "crateId" in t ? "crate:" + t.crateId : t.purpose;
/** A ticket lives 15 minutes on the server; draw a fresh one well before that. */
const FRESH_MS = 10 * 60_000;
type Prepared = {
  key: string;
  ticket: string;
  clientRedeem: boolean;
  ad: any;
  at: number;
};
let prepared: Prepared | null = null;
let preparing = "";
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
const ready = (key: string) =>
  prepared?.key === key && Date.now() - prepared.at < FRESH_MS;

/** Draw a ticket and load a video for one purpose; quietly does nothing when none can play. */
async function prepare(target: RewardFor) {
  const key = keyOf(target);
  if (Platform.OS === "web" || !unit() || preparing === key || ready(key))
    return;
  preparing = key;
  try {
    const ads = await import("react-native-google-mobile-ads");
    const { ticket, clientRedeem } = await api(
      "/ads/reward-ticket",
      "POST",
      target,
    );
    await ads.default().initialize();
    const ad = ads.RewardedAd.createForAdRequest(unit(), {
      // An 18+ game that asks for no tracking: non-personalised ads, no advertising identifier,
      // and therefore no App Tracking Transparency prompt.
      requestNonPersonalizedAdsOnly: true,
      serverSideVerificationOptions: { userId: ticket },
    });
    await new Promise<void>((resolve, reject) => {
      const offs = [
        ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
          offs.forEach((off) => off());
          resolve();
        }),
        ad.addAdEventListener(ads.AdEventType.ERROR, (e: unknown) => {
          offs.forEach((off) => off());
          reject(e);
        }),
      ];
      ad.load();
    });
    // The screen may have moved on to another purpose while this one loaded.
    if (preparing === key) {
      prepared = { key, ticket, clientRedeem, ad, at: Date.now() };
      changed();
    }
  } catch {
    // No ticket (the day's videos are used) or no fill: the button stays hidden.
  } finally {
    if (preparing === key) preparing = "";
  }
}

/**
 * True while a video for this purpose is loaded and ready. Pass null when the purpose has
 * nothing left (no started crate, no videos left today). Retries every half minute, which also
 * swaps in a fresh ticket before the old one expires.
 */
export function useVideo(target: RewardFor | null) {
  const key = target ? keyOf(target) : "";
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  useEffect(() => {
    if (!target) return;
    void prepare(target);
    const timer = setInterval(() => void prepare(target), 30_000);
    return () => clearInterval(timer);
  }, [key]);
  return !!key && ready(key);
}

/** Play the prepared video for this purpose (loading one first if none is ready). */
export async function showRewardedVideo(
  target: RewardFor,
): Promise<RewardOutcome> {
  const key = keyOf(target);
  if (!ready(key)) await prepare(target);
  const p = prepared;
  if (!p || !ready(key)) return "unavailable";
  prepared = null;
  changed();
  const ads = await import("react-native-google-mobile-ads");
  const outcome = await new Promise<RewardOutcome>((resolve) => {
    let earned = false;
    const offs: (() => void)[] = [];
    const done = (result: RewardOutcome) => {
      offs.forEach((off) => off());
      resolve(result);
    };
    offs.push(
      p.ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      p.ad.addAdEventListener(ads.AdEventType.CLOSED, () =>
        done(earned ? "granted" : "dismissed"),
      ),
      p.ad.addAdEventListener(ads.AdEventType.ERROR, () => done("unavailable")),
    );
    p.ad.show().catch(() => done("unavailable"));
  });
  // On a deployment AdMob cannot call back into — a developer machine, or production during a
  // test period on Google's sample units — the server lets the app redeem the ticket it was
  // issued. Otherwise AdMob's signed callback grants it.
  if (outcome === "granted" && p.clientRedeem)
    await api(`/ads/reward-ticket/${p.ticket}/redeem`, "POST", {}).catch(
      () => {},
    );
  // Load the next one, if the day allows another.
  void prepare(target);
  return outcome;
}

/** After a video, read back until the server shows the grant (AdMob's callback can lag). */
export async function untilGranted(check: () => Promise<boolean>) {
  for (let i = 0; i < 8; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}
