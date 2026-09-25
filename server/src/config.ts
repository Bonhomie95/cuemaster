export function assertProductionConfig(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== "production") return;
  const uri = env.MONGODB_URI || "";
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw Error("Production MongoDB URI must be configured.");
  }
  if (
    !["mongodb:", "mongodb+srv:"].includes(url.protocol) ||
    !url.username ||
    !url.password
  )
    throw Error("Production MongoDB requires authenticated access.");
  if (url.protocol !== "mongodb+srv:" && url.searchParams.get("tls") !== "true")
    throw Error("Production MongoDB requires TLS.");
  if (
    [
      "tlsInsecure",
      "tlsAllowInvalidCertificates",
      "tlsAllowInvalidHostnames",
    ].some((k) => url.searchParams.get(k) === "true") ||
    url.searchParams.get("tls") === "false"
  )
    throw Error("Production MongoDB cannot disable TLS verification.");
  if (!env.MONGODB_DB?.trim())
    throw Error("Production database name must be explicit.");
  if (
    !env.CORS_ORIGINS?.trim() ||
    env.CORS_ORIGINS.split(",").some((origin) => {
      try {
        const u = new URL(origin.trim());
        return (
          u.protocol !== "https:" ||
          u.origin !== origin.trim() ||
          u.hostname === "localhost"
        );
      } catch {
        return true;
      }
    })
  )
    throw Error("Production browser origins must be explicit HTTPS origins.");
  if (env.TRUST_PROXY === "true" || env.TRUST_PROXY === "*")
    throw Error("Trust only the exact deployment proxy addresses.");
  // Both stores reject listings whose privacy, support and deletion URLs are missing or dead.
  let base: URL;
  try {
    base = new URL(env.PUBLIC_BASE_URL || "");
  } catch {
    throw Error("PUBLIC_BASE_URL must be the public HTTPS origin of this API.");
  }
  if (base.protocol !== "https:" || base.hostname === "localhost")
    throw Error("PUBLIC_BASE_URL must be a public HTTPS origin.");
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(env.PUBLIC_SUPPORT_EMAIL || ""))
    throw Error("PUBLIC_SUPPORT_EMAIL must be a working support mailbox.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(env.PUBLIC_POLICY_DATE || ""))
    throw Error(
      "PUBLIC_POLICY_DATE must be the policy effective date (YYYY-MM-DD).",
    );
}
