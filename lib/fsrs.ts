// FSRS wrapper (Spec §4). All interval math goes through ts-fsrs — never hand-rolled.
import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  TypeConvert,
  type Card,
  type Grade,
} from "ts-fsrs";

const f = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));

export { Rating };
export type { Card, Grade };

/** A fresh card's FSRS state. Store this in the `fsrs` jsonb column. */
export function newCard(now = new Date()): Card {
  return createEmptyCard(now);
}

/**
 * Rehydrate a Card read back from the `fsrs` jsonb column — JSON turns the
 * Date fields (due, last_review) into ISO strings; ts-fsrs needs real Dates.
 * ALWAYS pass DB rows through this before calling review()/intervals().
 */
export function fromDb(fsrsJson: unknown): Card {
  return TypeConvert.card(fsrsJson as Parameters<typeof TypeConvert.card>[0]);
}

/**
 * Grade a review. Returns the updated Card and the review log to persist.
 * `due` (a column mirror) is `card.due`.
 */
export function review(card: Card, rating: Grade, now = new Date()) {
  const { card: next, log } = f.next(card, now, rating);
  return { card: next, log, due: next.due };
}

/** Human-readable next-interval preview for each button, e.g. "<10m" / "3d". */
export function intervals(card: Card, now = new Date()): Record<Grade, string> {
  const scheduled = f.repeat(card, now);
  const out = {} as Record<Grade, string>;
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const) {
    out[r] = formatMinutes((scheduled[r].card.due.getTime() - now.getTime()) / 60000);
  }
  return out;
}

function formatMinutes(min: number): string {
  if (min < 10) return "<10m";
  if (min < 60) return `${Math.round(min)}m`;
  const hours = min / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)}mo`;
  return `${Math.round(days / 365)}y`;
}
