import { test } from "node:test";
import assert from "node:assert/strict";
import { grammarAnswerMatches } from "../grammar";

test("grammar answers ignore casing and punctuation", () => {
  assert.equal(grammarAnswerMatches("We deployed the fix!", "we deployed the fix."), true);
});

test("grammar answers keep words that carry the rule", () => {
  assert.equal(grammarAnswerMatches("We deployed fix", "We deployed the fix"), false);
  assert.equal(grammarAnswerMatches("Let's discuss about it", "Let's discuss it"), false);
});
