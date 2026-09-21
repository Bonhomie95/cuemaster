function assertReleaseConfig(env) {
  const required = [
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_PRIVACY_URL",
    "EXPO_PUBLIC_TERMS_URL",
    "EXPO_PUBLIC_SUPPORT_URL",
    "EXPO_PUBLIC_ACCOUNT_DELETION_URL",
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
    "GOOGLE_IOS_URL_SCHEME",
    "EAS_PROJECT_ID",
  ];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw Error("Release configuration missing: " + missing.join(", "));
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
  if (!/^[0-9a-f-]{36}$/i.test(env.EAS_PROJECT_ID))
    throw Error("Set the real EAS project ID before building for stores.");
}
module.exports = { assertReleaseConfig };
