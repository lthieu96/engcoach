// Provider resolution (Spec §6, extended). The browser sends an LlmConfig per
// request (from localStorage); the key is used transiently and never persisted.
// There is NO server-side key fallback — every user brings their own key.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { preset, type LlmConfig } from "./providers";

export const DEFAULT_MODEL = process.env.LLM_MODEL ?? "gemini-flash-latest";

export function resolveModel(cfg?: Partial<LlmConfig>) {
  const providerId = cfg?.provider || "google";
  const p = preset(providerId);
  const model = cfg?.model?.trim() || p?.defaultModel || DEFAULT_MODEL;
  const apiKey = cfg?.apiKey?.trim();
  if (!apiKey)
    throw new Error(`Missing API key for "${providerId}" — open AI provider in Settings and add one`);

  if (p?.kind === "compatible" || (providerId !== "google" && cfg?.baseURL)) {
    const baseURL = cfg?.baseURL?.trim() || p?.baseURL;
    if (!baseURL) throw new Error(`No base URL for provider "${providerId}"`);
    return createOpenAICompatible({ name: providerId, baseURL, apiKey })(model);
  }

  return createGoogleGenerativeAI({ apiKey })(model);
}

/** Turn a provider/SDK error into a short user-facing message. */
export function llmError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Surface our own config errors verbatim; trim noisy provider errors.
  if (/API key|base URL|Settings/.test(msg)) return msg;
  return `LLM request failed: ${msg.slice(0, 200)}`;
}
