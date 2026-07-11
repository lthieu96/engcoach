// Voice-chat roleplay scenarios (Plan §3.3). `role` = who the LLM plays.
export const SCENARIOS = [
  {
    id: "standup",
    label: "Daily standup",
    role: "a friendly scrum master running the daily standup",
    scenario: "a daily standup where the developer reports yesterday's work, today's plan, and any blockers",
  },
  {
    id: "explain_bug",
    label: "Explain a bug to PM",
    role: "a non-technical product manager",
    scenario: "a quick sync where the developer explains a production bug, its impact, and the fix timeline",
  },
  {
    id: "code_review",
    label: "Disagree in code review",
    role: "a senior developer who left review comments the user disagrees with",
    scenario: "a code-review discussion where the developer politely pushes back on some feedback",
  },
  {
    id: "interview",
    label: "Mock interview",
    role: "a technical interviewer at a product company",
    scenario: "a job interview covering the developer's experience and a past project",
  },
] as const;

export type Scenario = (typeof SCENARIOS)[number];
