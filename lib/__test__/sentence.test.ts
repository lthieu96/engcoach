import { test } from "node:test";
import assert from "node:assert/strict";
import { sentenceAt } from "../anchor";

const text = "Hi team. I will discuss about the bug tomorrow. Thanks!";
const at = (needle: string) => {
  const s = text.indexOf(needle);
  return sentenceAt(text, s, s + needle.length);
};

test("slices the sentence containing the span, not the whole document", () => {
  assert.equal(at("discuss about"), "I will discuss about the bug tomorrow.");
});

test("handles the first and last sentence", () => {
  assert.equal(at("Hi team"), "Hi team.");
  assert.equal(at("Thanks"), "Thanks!");
});

test("no terminator at all → the whole text", () => {
  assert.equal(sentenceAt("just one line", 5, 8), "just one line");
});
