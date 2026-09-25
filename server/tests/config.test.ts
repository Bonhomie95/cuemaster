import { test } from "node:test";
import assert from "node:assert/strict";
import { assertProductionConfig } from "../src/config";
test("production rejects local defaults, unauthenticated databases, insecure TLS, wildcard proxy trust and missing public policy URLs", () => {
  assert.doesNotThrow(() =>
    assertProductionConfig({ NODE_ENV: "development" }),
  );
  assert.throws(() => assertProductionConfig({ NODE_ENV: "production" }));
  const env = {
    NODE_ENV: "production",
    MONGODB_URI: "mongodb+srv://user:example@db.example.invalid",
    MONGODB_DB: "cuemaster",
    CORS_ORIGINS: "https://app.example.invalid",
    PUBLIC_BASE_URL: "https://api.example.invalid",
    PUBLIC_SUPPORT_EMAIL: "support@example.invalid",
    PUBLIC_POLICY_DATE: "2026-09-23",
    TRUST_PROXY: "10.0.0.0/8",
  };
  assert.doesNotThrow(() => assertProductionConfig(env));
  for (const uri of [
    "mongodb://localhost:27017",
    "mongodb://user:pass@db.example.invalid",
    "mongodb+srv://user:pass@db.example.invalid/?tls=false",
    "mongodb+srv://user:pass@db.example.invalid/?tlsAllowInvalidCertificates=true",
  ])
    assert.throws(() => assertProductionConfig({ ...env, MONGODB_URI: uri }));
  assert.throws(() => assertProductionConfig({ ...env, TRUST_PROXY: "true" }));
  assert.throws(() => assertProductionConfig({ ...env, CORS_ORIGINS: "*" }));
  // Unset proxy trust makes every player share one rate-limit bucket behind a load balancer.
  assert.throws(() => assertProductionConfig({ ...env, TRUST_PROXY: "" }));
  // Store listings link to these pages; a missing or local URL must fail the release.
  for (const missing of [
    { PUBLIC_BASE_URL: "" },
    { PUBLIC_BASE_URL: "http://api.example.invalid" },
    { PUBLIC_BASE_URL: "https://localhost:4000" },
    { PUBLIC_SUPPORT_EMAIL: "" },
    { PUBLIC_SUPPORT_EMAIL: "not-an-address" },
    { PUBLIC_POLICY_DATE: "" },
    { PUBLIC_POLICY_DATE: "soon" },
  ])
    assert.throws(() => assertProductionConfig({ ...env, ...missing }));
});
