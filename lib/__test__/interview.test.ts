import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEvaluation, weakDimensions, type Evaluation } from "../interview";

const turns = [
  { idx: 0, content: "Let's design a URL shortener." },
  { idx: 1, content: "I would start with the read/write ratio and QPS." },
];

const base: Evaluation = {
  rubric: [
    {
      dimension: "requirements",
      score: 3,
      feedback: "ok",
      evidence: [
        { turn_idx: 1, quote: "read/write ratio" }, // exact substring → kept
        { turn_idx: 1, quote: "sharding strategy" }, // hallucinated → dropped
        { turn_idx: 9, quote: "read/write ratio" }, // bad turn → dropped
      ],
    },
  ],
  overall: 3,
  summary: "s",
  action_items: [],
  phases: [
    { phase: "requirements", from_idx: 0, to_idx: 1 }, // valid → kept
    { phase: "deep_dives", from_idx: 2, to_idx: 5 }, // out of range → dropped
    { phase: "wrap_up", from_idx: 1, to_idx: 0 }, // inverted → dropped
  ],
};

test("validateEvaluation keeps only verbatim, in-range evidence", () => {
  const v = validateEvaluation(base, turns);
  assert.deepEqual(v.rubric[0].evidence, [{ turn_idx: 1, quote: "read/write ratio" }]);
  assert.equal(v.rubric[0].score, 3); // score survives even when evidence is dropped
});

test("validateEvaluation drops out-of-range or inverted phases", () => {
  const v = validateEvaluation(base, turns);
  assert.deepEqual(v.phases, [{ phase: "requirements", from_idx: 0, to_idx: 1 }]);
});

const evalWith = (scores: Record<string, number>): Evaluation => ({
  rubric: Object.entries(scores).map(([dimension, score]) => ({
    dimension,
    score,
    feedback: "",
    evidence: [],
  })),
  overall: 3,
  summary: "",
  action_items: [],
  phases: [],
});

test("weakDimensions averages below the bar, weakest first, capped", () => {
  const evals = [
    evalWith({ trade_offs: 1, deep_dives: 2, requirements: 3, communication: 2 }),
    evalWith({ trade_offs: 2, deep_dives: 2, requirements: 4, communication: 3 }),
  ];
  // averages: trade_offs 1.5, deep_dives 2, communication 2.5, requirements 3.5
  assert.deepEqual(weakDimensions(evals), ["trade_offs", "deep_dives"]);
  assert.deepEqual(weakDimensions(evals, 3), ["trade_offs", "deep_dives", "communication"]);
});

test("weakDimensions is empty at or above the bar, or with no history", () => {
  assert.deepEqual(weakDimensions([evalWith({ requirements: 3, trade_offs: 4 })]), []);
  assert.deepEqual(weakDimensions([]), []);
});
