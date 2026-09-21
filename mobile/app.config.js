const { assertReleaseConfig } = require("./release-config.cjs");
module.exports = ({ config }) => {
  if (process.env.CUEMASTER_RELEASE === "1") assertReleaseConfig(process.env);
  return {
    ...config,
    ...(process.env.EAS_PROJECT_ID
      ? {
          extra: {
            ...config.extra,
            eas: { projectId: process.env.EAS_PROJECT_ID },
          },
        }
      : {}),
    plugins: [
      ...(config.plugins || []),
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
