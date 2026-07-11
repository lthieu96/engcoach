// Zod schemas for AI SDK generateObject (Spec §2).
import { z } from "zod";
import { RULE_TAGS, CHANNELS } from "./taxonomy";

// No `category` here: it's derived server-side from rule_tag (TAG_CATEGORY) so the
// LLM can't return a tag/category pair that disagrees.
export const Correction = z.object({
  original: z.string().describe("exact substring copied verbatim from the user's text"),
  occurrence: z.number().int().min(1).describe("1-based index of which occurrence of `original`"),
  replacement: z.string(),
  rule_tag: z.enum(RULE_TAGS),
  explanation: z.string().describe("1-2 sentences, plain B1 English"),
  severity: z.enum(["error", "suggestion"]),
});
export type Correction = z.infer<typeof Correction>;

export const CorrectionResult = z.object({
  corrections: z.array(Correction),
  natural_rewrite: z.string(),
  overall_comment: z.string(),
});
export type CorrectionResult = z.infer<typeof CorrectionResult>;

// Translate mode = CorrectionResult + scoring
export const TranslateResult = CorrectionResult.extend({
  meaning_score: z.number().min(1).max(5),
  alternatives: z.array(z.string()).min(1).max(2),
});
export type TranslateResult = z.infer<typeof TranslateResult>;

export const ComposeTask = z.object({
  scenario: z.string(),
  channel: z.enum(CHANNELS),
  audience: z.string(),
  goal: z.string(),
  constraints: z.array(z.string()).max(3),
  target_tags: z.array(z.string()).max(3),
});
export type ComposeTask = z.infer<typeof ComposeTask>;

// Vietnamese sentence for Translate mode
export const TranslateTask = z.object({
  vietnamese: z.string(),
  channel: z.enum(CHANNELS),
  context: z.string(),
});
export type TranslateTask = z.infer<typeof TranslateTask>;

export const Flashcard = z.object({
  front: z.string(),
  back: z.string(),
});
export type Flashcard = z.infer<typeof Flashcard>;

export const DictationBatch = z.object({
  sentences: z.array(z.string()).min(1).max(8),
});
export type DictationBatch = z.infer<typeof DictationBatch>;

export const SessionReport = z.object({
  corrections: z.array(Correction),
  better_phrasings: z.array(
    z.object({ you_said: z.string(), better: z.string(), why: z.string() })
  ),
  new_vocabulary: z.array(
    z.object({ term: z.string(), meaning: z.string(), example: z.string() })
  ),
  fluency_note: z.string(),
});
export type SessionReport = z.infer<typeof SessionReport>;
