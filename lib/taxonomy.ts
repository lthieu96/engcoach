// Error taxonomy for Vietnamese learners (Spec §1). LLM must pick rule_tag from RULE_TAGS.

export const RULE_TAGS = [
  "collocation",
  "word_form",
  "preposition",
  "subject_verb",
  "sentence_structure",
  "missing_be",
  "verb_tense",
  "article",
  "plural",
  "word_choice",
  "register_tone",
  "vietnamese_calque",
  "spelling",
  "other",
] as const;

export type RuleTag = (typeof RULE_TAGS)[number];

export const CATEGORIES = ["grammar", "clarity", "tone"] as const;
export type Category = (typeof CATEGORIES)[number];

// rule_tag → display category (Spec §1 mapping)
export const TAG_CATEGORY: Record<RuleTag, Category> = {
  subject_verb: "grammar",
  verb_tense: "grammar",
  article: "grammar",
  plural: "grammar",
  missing_be: "grammar",
  preposition: "grammar",
  word_form: "grammar",
  spelling: "grammar",
  collocation: "clarity",
  word_choice: "clarity",
  sentence_structure: "clarity",
  vietnamese_calque: "clarity",
  register_tone: "tone",
  other: "clarity",
};

// Display labels. Colors live in ONE place: the .u-* classes in app/globals.css.
export const CATEGORY_LABEL: Record<Category, string> = {
  grammar: "Grammar",
  clarity: "Clarity",
  tone: "Tone",
};

export const CHANNELS = ["email", "slack", "pr_description", "pr_comment"] as const;
export type Channel = (typeof CHANNELS)[number];

export const REGISTER_NOTE: Record<Channel, string> = {
  email: "clear, polite, professional",
  slack: "friendly, concise, casual but respectful",
  pr_description: "precise, structured, neutral",
  pr_comment: "constructive, direct but kind",
};
