import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage stub (providers.ts reads the bare `localStorage` global).
// Set before any provider function runs (they read localStorage lazily).
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

import { getLlm, setLlm, getProviderConfig } from "../providers";

beforeEach(() => store.clear());

test("switching providers keeps each provider's key", () => {
  setLlm({ provider: "google", model: "gemini-flash-latest", apiKey: "g-key" });
  setLlm({ provider: "xai", model: "grok-4.5", apiKey: "x-key", baseURL: "https://api.x.ai/v1" });
  // current is now xai
  assert.equal(getLlm().provider, "xai");
  assert.equal(getLlm().apiKey, "x-key");
  // google's key is NOT lost
  assert.equal(getProviderConfig("google").apiKey, "g-key");
});

test("getProviderConfig fills the preset base URL when none saved", () => {
  assert.equal(getProviderConfig("zai").baseURL, "https://api.z.ai/api/paas/v4");
});

test("migrates the old flat config shape", () => {
  store.set("engcoach:llm", JSON.stringify({ provider: "groq", model: "x", apiKey: "k" }));
  assert.equal(getLlm().provider, "groq");
  assert.equal(getLlm().apiKey, "k");
});
