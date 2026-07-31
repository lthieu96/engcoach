// Answer matching for typed vocab review. We are testing whether the learner
// knows the word, not whether they can type diacritics or remember an article —
// so normalize hard, then let the learner override with the rating buttons.

/** Lowercase, strip accents (VI + EN), drop punctuation and articles. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the typed answer is close enough to count. Containment both ways is
 * deliberate: "chốt lại" for "chốt lại vấn đề" is a pass, since the point is
 * recall, not transcription. Short fragments (< 3 chars) never match that way.
 */
export function matches(answer: string, expected: string): boolean {
  const a = normalize(answer);
  const e = normalize(expected);
  if (!a || !e) return false;
  if (a === e) return true;
  return a.length >= 3 && (a.includes(e) || e.includes(a));
}
