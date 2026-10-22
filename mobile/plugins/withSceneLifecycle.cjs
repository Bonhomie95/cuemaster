const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

// Expo 57 ships the scene delegate, but its bare template still starts RN in
// AppDelegate. iOS 27 requires a scene; older iOS versions support it too.
function migrateAppDelegate(source) {
  const provider = "ExpoReactNativeFactoryProvider";
  if (!source.includes(provider)) {
    source = source.replace(
      "class AppDelegate: ExpoAppDelegate {",
      `class AppDelegate: ExpoAppDelegate, ${provider} {`,
    );
    if (!source.includes(provider))
      throw Error(
        "Unsupported AppDelegate: scene lifecycle migration needs the Expo Swift template.",
      );
  }
  const legacyStart =
    /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\s*#endif/;
  source = source.replace(
    legacyStart,
    "// ExpoAppSceneDelegate creates the window and starts React Native.",
  );
  if (source.includes("factory.startReactNative("))
    throw Error(
      "Unsupported AppDelegate: remove legacy React Native startup before enabling scenes.",
    );
  return source;
}

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return config;
  });
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== "swift")
      throw Error("CueMaster requires a Swift Expo AppDelegate.");
    config.modResults.contents = migrateAppDelegate(config.modResults.contents);
    return config;
  });
}
module.exports = withSceneLifecycle;
module.exports.migrateAppDelegate = migrateAppDelegate;
