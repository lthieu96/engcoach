// Mock-interview domain: kinds, rubrics, evaluation validation (docs/04).
// Rubric dimensions and score descriptors mirror the hiring rubrics real
// companies use (docs/04 §1.4) — descriptors are injected into the evaluator
// prompt so a mid-tier model still grades against concrete bars.

export const INTERVIEW_KINDS = ["system_design", "dsa_walkthrough"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

export const KIND_LABEL: Record<InterviewKind, string> = {
  system_design: "System Design",
  dsa_walkthrough: "DSA Walkthrough",
};

export const SENIORITY = ["mid", "senior", "staff"] as const;
export type Seniority = (typeof SENIORITY)[number];

export const SENIORITY_LABEL: Record<Seniority, string> = {
  mid: "Mid-level",
  senior: "Senior",
  staff: "Staff",
};

export const DURATIONS = [25, 40] as const;

export const COMPANY_STYLES = ["generic", "meta", "google", "amazon"] as const;
export type CompanyStyle = (typeof COMPANY_STYLES)[number];

export const COMPANY_LABEL: Record<CompanyStyle, string> = {
  generic: "Generic",
  meta: "Meta",
  google: "Google",
  amazon: "Amazon",
};

// One flavor line injected into the interviewer + evaluator prompts (docs/04 Phase 3).
export const COMPANY_NOTE: Record<CompanyStyle, string> = {
  generic: "",
  meta: "Company flavor — Meta: move fast, expect the candidate to drive, weigh pragmatic trade-offs at large scale.",
  google:
    "Company flavor — Google: emphasize ambiguity in the problem, correctness, and rigorous justification of every choice.",
  amazon:
    "Company flavor — Amazon: probe operational excellence, cost awareness, and customer impact; expect ownership.",
};

export type InterviewConfig = {
  level: Seniority;
  target_minutes: number;
  question_source: "generated" | "user";
  company?: CompanyStyle;
  code?: string; // DSA: solution code, pasted at setup or submitted mid-session
  focus?: string[]; // dimensions weak in recent interviews — interviewer probes these harder
};

export const OVERALL_LABEL: Record<number, string> = {
  1: "Strong No Hire",
  2: "No Hire",
  3: "Leaning Hire",
  4: "Hire",
};

// ---- Rubrics -----------------------------------------------------------------

type Dimension = { id: string; label: string; descriptors: Record<1 | 2 | 3 | 4, string> };

const SYSTEM_DESIGN_RUBRIC: Dimension[] = [
  {
    id: "requirements",
    label: "Requirements",
    descriptors: {
      1: "Jumped straight to a solution; no clarifying questions.",
      2: "Asked a few generic questions; missed key functional or scale requirements.",
      3: "Clarified functional and non-functional requirements and prioritized them.",
      4: "Drove requirements crisply, quantified scale where it mattered, and used them to scope the design.",
    },
  },
  {
    id: "high_level_design",
    label: "High-level design",
    descriptors: {
      1: "No coherent end-to-end design.",
      2: "Design has major gaps or wrong component choices for the requirements.",
      3: "Sound end-to-end architecture with a reasonable API and data model.",
      4: "Clean architecture that clearly satisfies every requirement; API and data model are precise.",
    },
  },
  {
    id: "deep_dives",
    label: "Deep dives",
    descriptors: {
      1: "Could not go deeper than the block diagram on any component.",
      2: "Went deeper only when pushed, and stayed superficial (no bottlenecks, consistency, or failure handling).",
      3: "Handled at least one deep dive well: bottlenecks, consistency/availability, or failure modes.",
      4: "Proactively drove deep dives into the riskiest components with concrete mechanisms.",
    },
  },
  {
    id: "trade_offs",
    label: "Trade-offs",
    descriptors: {
      1: "Presented choices as the only option; no alternatives considered.",
      2: "Named trade-offs only when directly asked.",
      3: "Volunteered at least two real trade-offs with the rejected alternative and the reason.",
      4: "Every significant choice came with alternatives, costs, and a justified decision.",
    },
  },
  {
    id: "communication",
    label: "Communication",
    descriptors: {
      1: "Hard to follow; interviewer had to drag the discussion.",
      2: "Understandable but unstructured; interviewer steered the agenda.",
      3: "Structured and easy to follow; signposted what they were doing next.",
      4: "Drove the whole session with a clear plan and adjusted smoothly to pushback.",
    },
  },
];

const DSA_RUBRIC: Dimension[] = [
  {
    id: "communication",
    label: "Communication",
    descriptors: {
      1: "Explained almost nothing; answers had to be extracted.",
      2: "Described the solution but not the reasoning behind it.",
      3: "Clarified the problem and walked through the approach before details.",
      4: "Narrated reasoning throughout, surfaced assumptions, easy to follow end to end.",
    },
  },
  {
    id: "problem_solving",
    label: "Problem solving",
    descriptors: {
      1: "Approach does not solve the problem.",
      2: "Working approach but suboptimal with no awareness of better options.",
      3: "Sound approach with correct complexity analysis and at least one considered alternative.",
      4: "Optimal (or justified) approach; compared alternatives and reasoned about trade-offs unprompted.",
    },
  },
  {
    id: "verification",
    label: "Verification",
    descriptors: {
      1: "Claimed correctness without testing anything.",
      2: "Checked the happy path only when prompted.",
      3: "Walked through examples and named the important edge cases.",
      4: "Systematically dry-ran the solution, probed edge cases, and caught their own mistakes.",
    },
  },
];

// Graded only when the candidate pasted their solution code (4th DSA axis, docs/04 §1.4).
const CODING_DIMENSION: Dimension = {
  id: "coding",
  label: "Coding",
  descriptors: {
    1: "Code does not implement the stated approach or is unreadable.",
    2: "Works but messy: poor naming, duplicated logic, or fragile constructs.",
    3: "Clean, idiomatic code that matches the explained approach.",
    4: "Clean, efficient code the candidate connects precisely to their reasoning, including its limits.",
  },
};

export const RUBRICS: Record<InterviewKind, Dimension[]> = {
  system_design: SYSTEM_DESIGN_RUBRIC,
  dsa_walkthrough: DSA_RUBRIC,
};

/** Dimensions actually graded for one interview. */
export function rubricFor(kind: InterviewKind, hasCode = false): Dimension[] {
  return kind === "dsa_walkthrough" && hasCode ? [...DSA_RUBRIC, CODING_DIMENSION] : RUBRICS[kind];
}

export const DIMENSION_LABEL: Record<string, string> = Object.fromEntries(
  [...SYSTEM_DESIGN_RUBRIC, ...DSA_RUBRIC, CODING_DIMENSION].map((d) => [d.id, d.label])
);

export const PHASES: Record<InterviewKind, string[]> = {
  system_design: ["requirements", "api_and_entities", "high_level_design", "deep_dives", "wrap_up"],
  dsa_walkthrough: ["problem_understanding", "approach", "complexity", "edge_cases", "wrap_up"],
};

/** Rubric rendered for the evaluator prompt: dimension ids + per-score bars. */
export function rubricPrompt(kind: InterviewKind, hasCode = false): string {
  return rubricFor(kind, hasCode)
    .map(
      (d) =>
        `${d.id}:\n` +
        ([1, 2, 3, 4] as const).map((s) => `  ${s} = ${d.descriptors[s]}`).join("\n")
    )
    .join("\n");
}

// ---- Evaluation validation -----------------------------------------------------

export type Evidence = { turn_idx: number; quote: string };
export type RubricScore = {
  dimension: string;
  score: number;
  feedback: string;
  evidence: Evidence[];
};
export type Evaluation = {
  rubric: RubricScore[];
  overall: number;
  summary: string;
  action_items: string[];
  phases: { phase: string; from_idx: number; to_idx: number }[];
};

type Turn = { idx: number; content: string };

/**
 * Dimensions averaging below the hire bar (3) across recent evaluations,
 * weakest first, capped — fed into the next interviewer prompt so probing
 * targets what the candidate actually struggles with (deliberate practice).
 */
export function weakDimensions(evaluations: Evaluation[], cap = 2): string[] {
  const sums = new Map<string, { total: number; n: number }>();
  for (const ev of evaluations)
    for (const r of ev.rubric) {
      const s = sums.get(r.dimension) ?? { total: 0, n: 0 };
      s.total += r.score;
      s.n += 1;
      sums.set(r.dimension, s);
    }
  return [...sums]
    .map(([dim, s]) => [dim, s.total / s.n] as const)
    .filter(([, avg]) => avg < 3)
    .sort((a, b) => a[1] - b[1])
    .slice(0, cap)
    .map(([dim]) => dim);
}

/**
 * Anchor-style validation (lib/anchor.ts philosophy): never trust LLM citations.
 * Evidence whose quote is not a substring of the referenced turn is dropped
 * (score and feedback stay); phases with out-of-range turn indexes are dropped.
 */
export function validateEvaluation(ev: Evaluation, turns: Turn[]): Evaluation {
  const byIdx = new Map(turns.map((t) => [t.idx, t.content]));
  const maxIdx = Math.max(0, ...turns.map((t) => t.idx));
  return {
    ...ev,
    rubric: ev.rubric.map((r) => ({
      ...r,
      evidence: r.evidence.filter((e) => byIdx.get(e.turn_idx)?.includes(e.quote.trim())),
    })),
    phases: ev.phases.filter(
      (p) => p.from_idx >= 0 && p.to_idx <= maxIdx && p.from_idx <= p.to_idx
    ),
  };
}
