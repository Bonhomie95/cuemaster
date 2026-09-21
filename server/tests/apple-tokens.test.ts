import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { sealToken, openToken, appleConfigured } from "../src/appleTokens";
test("Apple refresh tokens are encrypted, tamper evident and bound to provider subject", () => {
  const previous = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  try {
    const sealed = sealToken("test-refresh-token", "subject-a");
    assert.ok(!JSON.stringify(sealed).includes("test-refresh-token"));
    assert.equal(openToken(sealed, "subject-a"), "test-refresh-token");
    assert.throws(() => openToken(sealed, "subject-b"));
    assert.throws(() =>
      openToken(
        { ...sealed, tag: Buffer.alloc(16).toString("base64") },
        "subject-a",
      ),
    );
    delete process.env.TOKEN_ENCRYPTION_KEY;
    assert.equal(appleConfigured(), false);
    assert.throws(() => sealToken("x", "subject-a"));
  } finally {
    if (previous === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = previous;
  }
});
