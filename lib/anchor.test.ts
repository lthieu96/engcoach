import { test } from "node:test";
import assert from "node:assert/strict";
import { anchor } from "./anchor";
import type { Correction } from "./schemas";

const base: Omit<Correction, "original" | "occurrence"> = {
  replacement: "X",
  rule_tag: "article",
  explanation: "e",
  severity: "error",
};
const c = (original: string, occurrence: number): Correction => ({ ...base, original, occurrence });

test("resolves the nth occurrence of a repeated word", () => {
  const text = "I go to to the office";
  const { anchored } = anchor(text, [c("to", 2)]);
  assert.equal(anchored.length, 1);
  assert.equal(anchored[0].start, 8); // second "to"
  assert.equal(text.slice(anchored[0].start, anchored[0].end), "to");
});

test("first occurrence when occurrence=1", () => {
  const { anchored } = anchor("to to", [c("to", 1)]);
  assert.equal(anchored[0].start, 0);
});

test("drops corrections whose substring is absent (bad LLM output)", () => {
  const { anchored, dropped } = anchor("hello world", [c("goodbye", 1)]);
  assert.equal(anchored.length, 0);
  assert.equal(dropped.length, 1);
});

test("drops when occurrence exceeds count", () => {
  const { anchored, dropped } = anchor("cat cat", [c("cat", 3)]);
  assert.equal(anchored.length, 0);
  assert.equal(dropped.length, 1);
});

test("drops overlapping spans, keeps the earlier", () => {
  const text = "make a mistake";
  const { anchored, dropped } = anchor(text, [c("make a", 1), c("a mistake", 1)]);
  assert.equal(anchored.length, 1);
  assert.equal(anchored[0].original, "make a");
  assert.equal(dropped.length, 1);
});

test("returns spans sorted by position", () => {
  const text = "he don't like the thing";
  const { anchored } = anchor(text, [c("the", 1), c("don't", 1)]);
  assert.deepEqual(
    anchored.map((a) => a.original),
    ["don't", "the"]
  );
});
