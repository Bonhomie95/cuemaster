import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyIdentity } from "../src/auth";
test("unconfigured providers cannot create identities", async () => {
  const original = process.env.GOOGLE_CLIENT_IDS;
  delete process.env.GOOGLE_CLIENT_IDS;
  try {
    await assert.rejects(
      verifyIdentity("google", "not-a-provider-token"),
      /not configured/,
    );
  } finally {
    if (original === undefined) delete process.env.GOOGLE_CLIENT_IDS;
    else process.env.GOOGLE_CLIENT_IDS = original;
  }
});
test("a configured audience does not accept a forged identity", async () => {
  const original = process.env.GOOGLE_CLIENT_IDS;
  process.env.GOOGLE_CLIENT_IDS = "test.apps.googleusercontent.com";
  try {
    await assert.rejects(verifyIdentity("google", "not-a-provider-token"));
  } finally {
    if (original === undefined) delete process.env.GOOGLE_CLIENT_IDS;
    else process.env.GOOGLE_CLIENT_IDS = original;
  }
});
