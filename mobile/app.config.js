const { assertReleaseConfig } = require("./release-config.cjs");
const { ids } = require("./ads.cjs");
module.exports = ({ config }) => {
  if (process.env.CUEMASTER_RELEASE === "1") assertReleaseConfig(process.env);
  return {
    ...config,
    extra: {
      ...config.extra,
      ...(process.env.EAS_PROJECT_ID
        ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
        : {}),
      // The rewarded unit the app asks for at runtime; the plugin below only registers the app.
      admob: {
        androidRewarded: ids().androidRewarded,
        iosRewarded: ids().iosRewarded,
      },
    },
    plugins: [
      ...(config.plugins || []),
      [
        "react-native-google-mobile-ads",
        {
          androidAppId: ids().androidAppId,
          iosAppId: ids().iosAppId,
          // 18+ game: never tagged for children, and no ATT prompt because the app asks for
          // non-personalised ads and reads no advertising identifier.
          userTrackingUsageDescription: undefined,
          skAdNetworkItems: undefined,
        },
      ],
      ...(process.env.GOOGLE_IOS_URL_SCHEME
        ? [
            [
              "@react-native-google-signin/google-signin",
              { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME },
            ],
          ]
        : []),
    ],
  };
};
