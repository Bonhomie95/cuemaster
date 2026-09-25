import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./api";

/**
 * Rewarded video.
 *
 * The advert is shown here, but nothing is granted here: the server issues a ticket, the ticket
 * travels to AdMob as the SSV user id, and AdMob's signed callback is what actually takes the
 * hour off the crate. That means a modified app cannot award itself anything.
 *
 * Ad identifiers come from the Expo config, which defaults to Google's public test units.
 */
const unit = () => {
  const admob = (Constants.expoConfig?.extra as any)?.admob || {};
  return Platform.OS === "ios" ? admob.iosRewarded : admob.androidRewarded;
};

export type RewardOutcome = "granted" | "dismissed" | "unavailable";

export async function showRewardedVideo(
  crateId: string,
): Promise<RewardOutcome> {
  if (Platform.OS === "web") return "unavailable";
  const adUnitId = unit();
  if (!adUnitId) return "unavailable";
  let ads: typeof import("react-native-google-mobile-ads");
  try {
    ads = await import("react-native-google-mobile-ads");
  } catch {
    return "unavailable";
  }
  const { ticket, clientRedeem } = await api("/ads/reward-ticket", "POST", {
    crateId,
  });

  const mobileAds = ads.default;
  await mobileAds().initialize();
  const rewarded = ads.RewardedAd.createForAdRequest(adUnitId, {
    // An 18+ game that asks for no tracking: non-personalised ads, no advertising identifier,
    // and therefore no App Tracking Transparency prompt.
    requestNonPersonalizedAdsOnly: true,
    serverSideVerificationOptions: { userId: ticket },
  });

  const outcome = await new Promise<RewardOutcome>((resolve) => {
    let earned = false;
    const done = (result: RewardOutcome) => {
      unsubscribe.forEach((off) => off());
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => done("unavailable"), 45000);
    const unsubscribe = [
      rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () =>
        rewarded.show().catch(() => done("unavailable")),
      ),
      rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      rewarded.addAdEventListener(ads.AdEventType.CLOSED, () =>
        done(earned ? "granted" : "dismissed"),
      ),
      rewarded.addAdEventListener(ads.AdEventType.ERROR, () =>
        done("unavailable"),
      ),
    ];
    rewarded.load();
  });

  // On a deployment AdMob cannot call back into — a developer machine — the server lets the
  // app redeem the ticket it was issued. Production refuses this and waits for the callback.
  if (outcome === "granted" && clientRedeem)
    await api(`/ads/reward-ticket/${ticket}/redeem`, "POST", {}).catch(
      () => {},
    );
  return outcome;
}
