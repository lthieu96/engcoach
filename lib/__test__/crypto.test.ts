import { test } from "node:test";
import assert from "node:assert/strict";

import { encrypt, decrypt } from "../crypto";

// The key is read lazily inside encrypt/decrypt, so setting it here is enough.
process.env.LLM_SYNC_SECRET = "test-secret";

test("encrypt/decrypt roundtrip", () => {
  const plain = JSON.stringify({ current: "google", byProvider: { google: { apiKey: "sk-x" } } });
  const blob = encrypt(plain);
  assert.notEqual(blob, plain);
  assert.equal(decrypt(blob), plain);
  // Fresh IV per call — same plaintext never encrypts to the same blob.
  assert.notEqual(encrypt(plain), blob);
});

test("decrypt rejects tampered blobs", () => {
  const blob = Buffer.from(encrypt("secret"), "base64");
  blob[blob.length - 1] ^= 0xff;
  assert.throws(() => decrypt(blob.toString("base64")));
});
