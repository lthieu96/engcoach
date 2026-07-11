// Span anchoring (Spec §2). Never trust char offsets from the LLM.
// Resolve `original` + `occurrence` (1-based) → {start, end} via repeated indexOf.
// Corrections whose substring can't be found are dropped (caller logs them).
import type { Correction } from "./schemas";

export type AnchoredCorrection = Correction & { start: number; end: number };

/** Find the byte range of the `occurrence`-th appearance of `needle` in `text`. */
function nthIndexOf(text: string, needle: string, occurrence: number): number {
  if (needle.length === 0) return -1;
  let from = 0;
  for (let i = 0; i < occurrence; i++) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) return -1;
    if (i === occurrence - 1) return idx;
    from = idx + needle.length;
  }
  return -1;
}

export function anchor(
  text: string,
  corrections: Correction[]
): { anchored: AnchoredCorrection[]; dropped: Correction[] } {
  const anchored: AnchoredCorrection[] = [];
  const dropped: Correction[] = [];

  for (const c of corrections) {
    const start = nthIndexOf(text, c.original, c.occurrence);
    if (start === -1) {
      dropped.push(c);
      continue;
    }
    anchored.push({ ...c, start, end: start + c.original.length });
  }

  // Sort by position; drop overlaps (keep the earlier one) so the annotated
  // view can render non-overlapping <mark> spans.
  anchored.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: AnchoredCorrection[] = [];
  let lastEnd = -1;
  for (const c of anchored) {
    if (c.start < lastEnd) {
      dropped.push(c);
      continue;
    }
    kept.push(c);
    lastEnd = c.end;
  }
  return { anchored: kept, dropped };
}
