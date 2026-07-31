import { test } from "node:test";
import assert from "node:assert/strict";
import { matches } from "../vocab";

test("ignores case, punctuation and articles", () => {
  assert.ok(matches("Roll Back!", "roll back"));
  assert.ok(matches("a rollback", "rollback"));
});

test("ignores Vietnamese diacritics", () => {
  assert.ok(matches("chot lai", "chốt lại"));
  assert.ok(matches("đẩy code", "day code"));
});

test("accepts a shorter but contained answer", () => {
  assert.ok(matches("chốt lại", "chốt lại vấn đề"));
});

test("rejects a wrong answer and near-empty input", () => {
  assert.ok(!matches("merge the branch", "roll back"));
  assert.ok(!matches("ro", "roll back"));
  assert.ok(!matches("   ", "roll back"));
});
