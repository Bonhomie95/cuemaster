const { usingTestIds } = require("./ads.cjs");
/** `projectId` is the EAS project, from `EAS_PROJECT_ID` or app.json's `extra.eas.projectId`. */
function assertReleaseConfig(env, projectId) {
  // The privacy, terms, support and deletion links come from the API's /config response, so the
  // server's PUBLIC_BASE_URL is their single source. Requiring copies here only created four
  // settings the owner could get wrong and the app would never read.
  const required = ["EXPO_PUBLIC_API_URL"];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw Error("Release configuration missing: " + missing.join(", "));
  // Google sign-in is optional: the app offers it only when the server has it set up, and on
  // iPhone only when this build carries its client id. Half a configuration is the mistake.
  if (!env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID !== !env.GOOGLE_IOS_URL_SCHEME)
    throw Error(
      "Set both EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and GOOGLE_IOS_URL_SCHEME, or neither.",
    );
  for (const name of required.filter((n) => n.endsWith("_URL"))) {
    let url;
    try {
      url = new URL(env[name]);
    } catch {
      throw Error(name + " must be a valid HTTPS URL.");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      /^(localhost|127\.|0\.|10\.|192\.168\.|\[::1\])/.test(url.hostname) ||
      url.hostname.endsWith(".local")
    )
      throw Error(name + " must use a public HTTPS origin.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(projectId || ""))
    throw Error(
      "Run `npx eas-cli init` (or set EAS_PROJECT_ID) before building for stores.",
    );
  // Google's public test units serve adverts but earn nothing and are not allowed in a
  // published build. Shipping them is a silent revenue loss and an AdMob policy problem.
  if (usingTestIds())
    throw Error(
      'Replace the "react-native-google-mobile-ads" identifiers in app.json with your own AdMob app and rewarded unit ids; Google\'s test identifiers cannot be published.',
    );
}
module.exports = { assertReleaseConfig };
