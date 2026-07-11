import { test } from "node:test";
import assert from "node:assert/strict";
import { newCard, review, fromDb, Rating } from "../fsrs";

test("Again keeps the card due very soon (learning step)", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const { due } = review(newCard(now), Rating.Again, now);
  const min = (due.getTime() - now.getTime()) / 60000;
  assert.ok(min <= 15, `expected <=15m, got ${min}m`);
});

test("Good schedules further out than Again", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const again = review(newCard(now), Rating.Again, now).due.getTime();
  const good = review(newCard(now), Rating.Good, now).due.getTime();
  assert.ok(good > again);
});

test("fromDb rehydrates a jsonb round-trip so review() still works", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const stored = JSON.parse(JSON.stringify(newCard(now))); // what Supabase jsonb returns
  assert.equal(typeof stored.due, "string");
  const card = fromDb(stored);
  assert.ok(card.due instanceof Date);
  const { due } = review(card, Rating.Good, now);
  assert.ok(due instanceof Date && due.getTime() > now.getTime());
});

test("repeated Good reviews grow the interval", () => {
  let now = new Date("2026-01-01T00:00:00Z");
  let card = newCard(now);
  let prevGap = 0;
  for (let i = 0; i < 4; i++) {
    const r = review(card, Rating.Good, now);
    const gap = r.due.getTime() - now.getTime();
    if (i > 0) assert.ok(gap >= prevGap, `interval shrank at step ${i}`);
    prevGap = gap;
    card = r.card;
    now = r.due; // review exactly when due
  }
});
