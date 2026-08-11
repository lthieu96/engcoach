/** Grammar drills require exact words, but not exact casing or punctuation. */
export function normalizeGrammarAnswer(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function grammarAnswerMatches(answer: string, expected: string): boolean {
  const normalized = normalizeGrammarAnswer(answer);
  return normalized.length > 0 && normalized === normalizeGrammarAnswer(expected);
}
