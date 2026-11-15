import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { assertReleaseConfig } = require("../mobile/release-config.cjs");
const { usingTestIds } = require("../mobile/ads.cjs");

const API = { EXPO_PUBLIC_API_URL: "https://cuemaster-api.onrender.com" };
const PROJECT = "12345678-1234-1234-1234-123456789abc";

test("a store build needs a public HTTPS API, an EAS project and real AdMob ids; Google sign-in is optional", () => {
  assert.throws(() => assertReleaseConfig({}, PROJECT), /EXPO_PUBLIC_API_URL/);
  for (const url of [
    "http://cuemaster-api.onrender.com",
    "https://localhost:4000",
  ])
    assert.throws(
      () => assertReleaseConfig({ EXPO_PUBLIC_API_URL: url }, PROJECT),
      /public HTTPS/,
    );
  assert.throws(() => assertReleaseConfig(API, undefined), /eas-cli init/);
  // A Google client id needs its reversed form as the google-signin plugin's URL scheme.
  const google = {
    ...API,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "123-abc.apps.googleusercontent.com",
  };
  const signin = (iosUrlScheme: string) => [
    ["@react-native-google-signin/google-signin", { iosUrlScheme }],
  ];
  assert.throws(() => assertReleaseConfig(google, PROJECT), /iosUrlScheme/);
  assert.throws(
    () =>
      assertReleaseConfig(
        google,
        PROJECT,
        signin("com.googleusercontent.apps.other"),
      ),
    /iosUrlScheme/,
  );
  const matched = () =>
    assertReleaseConfig(
      google,
      PROJECT,
      signin("com.googleusercontent.apps.123-abc"),
    );
  if (usingTestIds()) assert.throws(matched, /AdMob/);
  else assert.doesNotThrow(matched);
  // With everything else right, the remaining gate is Google's test ad units in app.json.
  if (usingTestIds())
    assert.throws(() => assertReleaseConfig(API, PROJECT), /AdMob/);
  else assert.doesNotThrow(() => assertReleaseConfig(API, PROJECT));
});
