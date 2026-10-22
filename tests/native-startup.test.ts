import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  migrateAppDelegate,
} = require("../mobile/plugins/withSceneLifecycle.cjs");

test("iOS scene migration preserves linking and starts React Native only through its scene", () => {
  const old = `class AppDelegate: ExpoAppDelegate {
  var reactNativeFactory: RCTReactNativeFactory?
  func start() {
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
  }
  // Universal Links
  func openURL() { RCTLinkingManager.openURL() }
}`;
  const updated = migrateAppDelegate(old);
  assert.match(updated, /ExpoReactNativeFactoryProvider/);
  assert.doesNotMatch(updated, /factory.startReactNative\(/);
  assert.match(updated, /RCTLinkingManager.openURL\(\)/);
  assert.equal(migrateAppDelegate(updated), updated);
  assert.throws(() => migrateAppDelegate("class CustomDelegate {}"));
});
