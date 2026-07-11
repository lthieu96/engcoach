// Learner profile settings stored in profiles.settings (jsonb).
import type { SupabaseClient } from "@supabase/supabase-js";

export const LEVELS = ["A2", "B1", "B2", "C1"] as const;
export type Level = (typeof LEVELS)[number];
export const DEFAULT_LEVEL: Level = "B1";

export const LEVEL_LABEL: Record<Level, string> = {
  A2: "A2 — Elementary",
  B1: "B1 — Intermediate",
  B2: "B2 — Upper-intermediate",
  C1: "C1 — Advanced",
};

export const LENGTHS = ["short", "medium", "long"] as const;
export type TaskLength = (typeof LENGTHS)[number];
export const DEFAULT_LENGTH: TaskLength = "medium";

export const LENGTH_LABEL: Record<TaskLength, string> = {
  short: "Short — a couple of sentences",
  medium: "Medium — a short message",
  long: "Long — a paragraph or two",
};

export type LearnerSettings = { level: Level; length: TaskLength; autoTask: boolean };

/** Server-side: learner settings from profiles.settings, with defaults. */
export async function getLearnerSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<LearnerSettings> {
  const { data } = await supabase.from("profiles").select("settings").eq("id", userId).single();
  const s = (data?.settings ?? {}) as { level?: string; length?: string; auto_task?: boolean };
  return {
    level: (LEVELS as readonly string[]).includes(s.level ?? "") ? (s.level as Level) : DEFAULT_LEVEL,
    length: (LENGTHS as readonly string[]).includes(s.length ?? "")
      ? (s.length as TaskLength)
      : DEFAULT_LENGTH,
    autoTask: s.auto_task ?? true,
  };
}

/** The learner's CEFR level only (most routes need nothing else). */
export async function getLevel(supabase: SupabaseClient, userId: string): Promise<Level> {
  return (await getLearnerSettings(supabase, userId)).level;
}
