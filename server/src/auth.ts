import { createRemoteJWKSet, jwtVerify } from "jose";
const google = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const apple = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);
export async function verifyIdentity(
  provider: "google" | "apple",
  token: string,
  nonce?: string,
) {
  const audiences = (
    provider === "google"
      ? process.env.GOOGLE_CLIENT_IDS
      : process.env.APPLE_CLIENT_IDS
  )
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!audiences?.length)
    throw new Error("This sign-in provider is not configured yet.");
  const { payload } = await jwtVerify(
    token,
    provider === "google" ? google : apple,
    {
      issuer:
        provider === "google"
          ? ["https://accounts.google.com", "accounts.google.com"]
          : "https://appleid.apple.com",
      audience: audiences,
      algorithms: ["RS256"],
    },
  );
  if (!payload.sub) throw new Error("Missing provider identity.");
  if (provider === "apple" && (!nonce || payload.nonce !== nonce))
    throw new Error("Sign-in challenge mismatch.");
  return {
    subject: payload.sub,
    audience: typeof payload.aud === "string" ? payload.aud : payload.aud?.[0],
    email:
      payload.email_verified === true || payload.email_verified === "true"
        ? String(payload.email || "")
        : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}
