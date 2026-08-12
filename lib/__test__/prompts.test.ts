import { test } from "node:test";
import assert from "node:assert/strict";
import { translateTaskSystem } from "../prompts";

test("interview translate tasks use the topic and interview channel", () => {
  const prompt = translateTaskSystem([], [], "B1", "medium", "Node.js event loop");

  assert.match(prompt, /Node\.js event loop/);
  assert.match(prompt, /80-140 words/);
  assert.match(prompt, /Set "channel" to "interview"/);
  assert.match(prompt, /exact interview question in English/);
});
