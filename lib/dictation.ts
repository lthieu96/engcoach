// Score a dictation attempt against the target sentence (Listen feature).
// Comparison ignores case & punctuation (you dictate speech, not spelling of
// commas); the cloze blanks exactly the words the learner missed.
import { diffArrays } from "diff";

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9']/g, "");

export type DictationResult = {
  correct: boolean;
  missed: number; // target words not typed
  total: number; // target words
  clozeFront: string; // target with missed words blanked → flashcard front
};

export function scoreDictation(target: string, typed: string): DictationResult {
  const targetTokens = target.split(/\s+/).filter(Boolean);
  const a = typed.split(/\s+/).filter(Boolean).map(norm);
  const b = targetTokens.map(norm);

  const parts = diffArrays(a, b);
  const out: string[] = [];
  let ti = 0;
  let missed = 0;
  for (const part of parts) {
    if (part.removed) continue; // typed extra — not part of the target
    for (let i = 0; i < part.value.length; i++) {
      const orig = targetTokens[ti++];
      if (part.added) {
        out.push("____");
        missed++;
      } else {
        out.push(orig);
      }
    }
  }

  return {
    correct: missed === 0,
    missed,
    total: targetTokens.length,
    clozeFront: out.join(" "),
  };
}
