import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { verifyIdentity } from "./auth";
export function appleConfigured() {
  return !!(
    process.env.APPLE_CLIENT_IDS &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_PRIVATE_KEY &&
    /^[0-9a-fA-F]{64}$/.test(process.env.TOKEN_ENCRYPTION_KEY || "")
  );
}
function encryptionKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex))
    throw Error("Token encryption is not configured.");
  return Buffer.from(hex, "hex");
}
export function sealToken(token: string, subject: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(subject));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}
export function openToken(value: any, subject: string) {
  if (value.version !== 1) throw Error("Unsupported token encryption version.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(subject));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
async function secret(clientId: string) {
  if (
    !appleConfigured() ||
    !process.env
      .APPLE_CLIENT_IDS!.split(",")
      .map((s) => s.trim())
      .includes(clientId)
  )
    throw Error("Apple token service is not configured.");
  const key = await importPKCS8(
    process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    "ES256",
  );
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!)
    .setSubject(clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}
export async function exchangeAppleCode(
  code: string,
  clientId: string,
  subject: string,
  nonce: string,
) {
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await secret(clientId),
      code,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw Error("Apple sign-in could not be completed. Please sign in again.");
  const result = await response.json();
  if (!result.refresh_token || !result.id_token)
    throw Error("Apple did not return required account tokens.");
  const identity = await verifyIdentity("apple", result.id_token, nonce);
  if (identity.subject !== subject || identity.audience !== clientId)
    throw Error("Apple authorization does not match this account.");
  return { clientId, token: sealToken(result.refresh_token, subject) };
}
export async function revokeAppleToken(record: any, subject: string) {
  if (!record?.token || !record.clientId)
    throw Error("Sign in with Apple again before deleting this account.");
  const response = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: record.clientId,
      client_secret: await secret(record.clientId),
      token: openToken(record.token, subject),
      token_type_hint: "refresh_token",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw Error(
      "Apple authorization could not be revoked. Please try account deletion again shortly.",
    );
}
