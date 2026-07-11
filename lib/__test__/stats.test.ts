import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countByDay,
  heatLevel,
  retention,
  wordCount,
  weekBucket,
  trendByCategory,
  topTags,
} from "../stats";

test("heatLevel buckets", () => {
  assert.equal(heatLevel(0), 0);
  assert.equal(heatLevel(2), 1);
  assert.equal(heatLevel(5), 2);
  assert.equal(heatLevel(9), 3);
  assert.equal(heatLevel(50), 4);
});

test("retention: pass = rating >= 2, Again fails", () => {
  assert.equal(retention([{ rating: 1 }, { rating: 3 }, { rating: 3 }, { rating: 4 }]), 75);
  assert.equal(retention([]), null);
});

test("wordCount ignores extra whitespace", () => {
  assert.equal(wordCount("  hello   world "), 2);
  assert.equal(wordCount(""), 0);
});

test("countByDay groups same-day events", () => {
  const m = countByDay(["2026-07-10T01:00:00", "2026-07-10T23:00:00", "2026-07-11T05:00:00"]);
  assert.equal(m.get("2026-07-10"), 2);
  assert.equal(m.get("2026-07-11"), 1);
});

test("weekBucket: current week is last index, out-of-range is -1", () => {
  const now = new Date("2026-07-11T12:00:00");
  assert.equal(weekBucket("2026-07-11T00:00:00", now, 8), 7); // today → current week
  assert.equal(weekBucket("2026-07-04T12:00:00", now, 8), 6); // 7 days ago → prev week
  assert.equal(weekBucket("2026-05-01T00:00:00", now, 8), -1); // >8 weeks → dropped
});

test("trendByCategory maps rule_tag → category bucket", () => {
  const now = new Date("2026-07-11T12:00:00");
  const t = trendByCategory(
    [
      { rule_tag: "article", created_at: "2026-07-11T00:00:00" }, // grammar, current wk
      { rule_tag: "collocation", created_at: "2026-07-11T00:00:00" }, // clarity, current wk
      { rule_tag: "register_tone", created_at: "2026-07-04T12:00:00" }, // tone, prev wk
    ],
    now,
    8
  );
  assert.equal(t.grammar[7], 1);
  assert.equal(t.clarity[7], 1);
  assert.equal(t.tone[6], 1);
});

test("topTags ranks by count", () => {
  const now = new Date("2026-07-11T12:00:00");
  const rows = [
    { rule_tag: "article", created_at: "2026-07-11T00:00:00" },
    { rule_tag: "article", created_at: "2026-07-11T00:00:00" },
    { rule_tag: "preposition", created_at: "2026-07-11T00:00:00" },
  ];
  const top = topTags(rows, now, 5, 6);
  assert.equal(top[0].tag, "article");
  assert.equal(top[0].count, 2);
  assert.equal(top[0].category, "grammar");
  assert.equal(top[0].spark[5], 2);
});
