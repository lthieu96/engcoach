import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreDictation } from "../dictation";

test("perfect transcription (ignoring case/punctuation) = correct", () => {
  const r = scoreDictation("The deploy failed because the migration didn't run.", "the deploy failed because the migration didn't run");
  assert.equal(r.correct, true);
  assert.equal(r.missed, 0);
  assert.equal(r.total, 8);
});

test("missed words are counted and blanked in the cloze", () => {
  const r = scoreDictation("Please review my pull request", "please review pull request");
  assert.equal(r.correct, false);
  assert.equal(r.missed, 1); // "my"
  assert.equal(r.clozeFront, "Please review ____ pull request");
});

test("extra typed words don't count as missed", () => {
  const r = scoreDictation("ship it now", "ship it right now");
  assert.equal(r.correct, true);
  assert.equal(r.missed, 0);
});

test("all wrong → everything blanked", () => {
  const r = scoreDictation("stand up meeting", "totally different text");
  assert.equal(r.missed, 3);
  assert.equal(r.clozeFront, "____ ____ ____");
});
