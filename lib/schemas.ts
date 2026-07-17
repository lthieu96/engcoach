// Zod schemas for AI SDK generateObject (Spec §2).
import { z } from "zod";
import { RULE_TAGS, CHANNELS } from "./taxonomy";
import { rubricFor, PHASES, type InterviewKind } from "./interview";

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

// Technical takeaway cards generated from a mock interview (docs/04).
export const FlashcardBatch = z.object({
  cards: z.array(Flashcard).min(1).max(6),
});
export type FlashcardBatch = z.infer<typeof FlashcardBatch>;

export const DictationBatch = z.object({
  sentences: z.array(z.string()).min(1).max(8),
});
export type DictationBatch = z.infer<typeof DictationBatch>;

export const InterviewQuestion = z.object({
  question: z
    .string()
    .describe("the full interview question as the interviewer would state it, under 80 words"),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestion>;

// Rubric dimensions differ per kind (and DSA gains a coding axis when the
// candidate pasted code), so the schema is built per interview (docs/04 §4.1).
export function interviewEvaluationSchema(kind: InterviewKind, hasCode = false) {
  const dimensions = rubricFor(kind, hasCode).map((d) => d.id);
  return z.object({
    rubric: z.array(
      z.object({
        dimension: z.enum(dimensions as [string, ...string[]]),
        score: z.number().int().min(1).max(4),
        feedback: z.string().describe("2-3 specific sentences on this dimension"),
        evidence: z
          .array(
            z.object({
              turn_idx: z.number().int().describe("idx of the transcript turn quoted"),
              quote: z.string().describe("exact substring copied verbatim from that turn"),
            })
          )
          .max(3),
      })
    ),
    overall: z.number().int().min(1).max(4).describe("1=Strong No Hire … 4=Hire"),
    summary: z.string().describe("2-3 sentences, start with what went well"),
    action_items: z.array(z.string()).max(3).describe("concrete, doable next steps"),
    phases: z.array(
      z.object({
        phase: z.enum(PHASES[kind] as [string, ...string[]]),
        from_idx: z.number().int(),
        to_idx: z.number().int(),
      })
    ),
  });
}

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
