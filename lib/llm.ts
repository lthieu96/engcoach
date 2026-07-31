// Provider resolution (Spec §6, extended). The browser sends an LlmConfig per
// request (from localStorage); the key is used transiently and never persisted.
// There is NO server-side key fallback — every user brings their own key.
import { wrapLanguageModel, defaultSettingsMiddleware } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { preset, type Effort, type LlmConfig } from "./providers";

export const DEFAULT_MODEL = process.env.LLM_MODEL ?? "gemini-flash-latest";

// Gemini thinking budgets (tokens) per effort step. Other providers take the
// effort string directly as reasoningEffort.
const GOOGLE_BUDGET: Record<Exclude<Effort, "default">, number> = {
  low: 1024,
  medium: 8192,
  high: 24576,
};

// Bake the user's thinking-effort into the model via middleware so every call
// site (`model: resolveModel(llm)`) picks it up without changes.
function effortMiddleware(key: string, options: Record<string, string | Record<string, number>>) {
  return defaultSettingsMiddleware({ settings: { providerOptions: { [key]: options } } });
}

export function resolveModel(cfg?: Partial<LlmConfig>) {
  const providerId = cfg?.provider || "google";
  const p = preset(providerId);
  const model = cfg?.model?.trim() || p?.defaultModel || DEFAULT_MODEL;
  const apiKey = cfg?.apiKey?.trim();
  if (!apiKey)
    throw new Error(`Missing API key for "${providerId}" — open AI provider in Settings and add one`);
  const effort = cfg?.effort && cfg.effort !== "default" ? cfg.effort : undefined;

  if (p?.kind === "compatible" || (providerId !== "google" && cfg?.baseURL)) {
    const baseURL = cfg?.baseURL?.trim() || p?.baseURL;
    if (!baseURL) throw new Error(`No base URL for provider "${providerId}"`);
    const m = createOpenAICompatible({ name: providerId, baseURL, apiKey })(model);
    // providerOptions key = the `name` above (openai-compatible providerOptionsName).
    return effort
      ? wrapLanguageModel({ model: m, middleware: effortMiddleware(providerId, { reasoningEffort: effort }) })
      : m;
  }

  const m = createGoogleGenerativeAI({ apiKey })(model);
  return effort
    ? wrapLanguageModel({
        model: m,
        middleware: effortMiddleware("google", { thinkingConfig: { thinkingBudget: GOOGLE_BUDGET[effort] } }),
      })
    : m;
}

/**
 * Settings for every GRADING call (correct, report, interview eval, flashcard).
 * Grading must be reproducible: re-checking the same draft has to give the same
 * verdict, otherwise the learner sees a different set of "fixes" each time.
 * Generation calls (tasks, interviewer turns, dictation) keep default sampling —
 * they WANT variety.
 */
export const GRADING = { temperature: 0 } as const;

/** Turn a provider/SDK error into a short user-facing message. */
export function llmError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Surface our own config errors verbatim; trim noisy provider errors.
  if (/API key|base URL|Settings/.test(msg)) return msg;
  return `LLM request failed: ${msg.slice(0, 200)}`;
}
