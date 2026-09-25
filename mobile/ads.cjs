/**
 * AdMob identifiers, read from the one place Android can also read them.
 *
 * The Android gradle plugin parses `app.json` from disk, so the top-level
 * `react-native-google-mobile-ads` block is the single source of truth; the Expo plugin options
 * and the runtime unit ids are both derived from it. Defaults are Google's own public test
 * units, which serve real creatives without an AdMob account and earn nothing.
 * `assertReleaseConfig` refuses to build a release while they are still in place.
 */
const TEST = {
  android_app_id: "ca-app-pub-3940256099942544~3347511713",
  ios_app_id: "ca-app-pub-3940256099942544~1458002511",
  android_rewarded_unit_id: "ca-app-pub-3940256099942544/5224354917",
  ios_rewarded_unit_id: "ca-app-pub-3940256099942544/1712485313",
};
const config = () =>
  require("./app.json")["react-native-google-mobile-ads"] || {};
const ids = () => {
  const c = config();
  return {
    androidAppId: c.android_app_id || TEST.android_app_id,
    iosAppId: c.ios_app_id || TEST.ios_app_id,
    androidRewarded:
      c.android_rewarded_unit_id || TEST.android_rewarded_unit_id,
    iosRewarded: c.ios_rewarded_unit_id || TEST.ios_rewarded_unit_id,
  };
};
const usingTestIds = () => {
  const c = config();
  return Object.entries(TEST).some(
    ([key, value]) => (c[key] || value) === value,
  );
};
module.exports = { TEST, ids, usingTestIds };
