// LLM provider presets + local (localStorage) config. Pure data — safe on client.
// Config is NEVER stored in the DB; the browser sends it per-request.

export type ProviderKind = "google" | "compatible";

export type Preset = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseURL?: string; // OpenAI-compatible base (compatible kind)
  models: string[]; // suggestions; the model field is also free-text
  defaultModel: string;
  keyUrl?: string; // where to get an API key
  note?: string;
};

// Every non-Google provider here speaks the OpenAI-compatible protocol, so one
// `@ai-sdk/openai-compatible` client reaches all of them (Spec: verified 2026-07).
export const PROVIDERS: Preset[] = [
  {
    id: "google",
    label: "Google Gemini",
    kind: "google",
    models: ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite"],
    defaultModel: "gemini-flash-latest",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "Free tier available — create a key in Google AI Studio.",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    kind: "compatible",
    baseURL: "https://api.x.ai/v1",
    models: ["grok-4.5", "grok-4.3"],
    defaultModel: "grok-4.5",
    keyUrl: "https://console.x.ai",
  },
  {
    id: "zai",
    label: "Z.AI (GLM)",
    kind: "compatible",
    baseURL: "https://api.z.ai/api/paas/v4",
    models: ["glm-4.6", "glm-4.7-flash", "glm-4.5-flash"],
    defaultModel: "glm-4.6",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    note: "*-flash models are free (rate-limited).",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "compatible",
    baseURL: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "compatible",
    baseURL: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
    defaultModel: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "compatible",
    baseURL: "https://openrouter.ai/api/v1",
    models: [],
    defaultModel: "",
    keyUrl: "https://openrouter.ai/keys",
    note: "One key, hundreds of models — type the model id.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    kind: "compatible",
    baseURL: "",
    models: [],
    defaultModel: "",
    note: "Any endpoint exposing /chat/completions.",
  },
];

export function preset(id: string): Preset | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export type LlmConfig = {
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string; // override the preset's base
};

const KEY = "engcoach:llm";

// Per-provider store so switching providers never drops a key you already entered.
type Saved = { model?: string; apiKey?: string; baseURL?: string };
type Store = { current: string; byProvider: Record<string, Saved> };

function readStore(): Store {
  if (typeof localStorage === "undefined") return { current: "google", byProvider: {} };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "");
    if (s?.byProvider) return s as Store;
    // Migrate the old flat {provider,model,apiKey,baseURL} shape.
    if (s?.provider) {
      return {
        current: s.provider,
        byProvider: { [s.provider]: { model: s.model, apiKey: s.apiKey, baseURL: s.baseURL } },
      };
    }
  } catch {}
  return { current: "google", byProvider: {} };
}

/** Config for a specific provider (preset base URL filled if none saved). */
export function getProviderConfig(provider: string): LlmConfig {
  const saved = readStore().byProvider[provider] ?? {};
  return {
    provider,
    model: saved.model ?? "",
    apiKey: saved.apiKey ?? "",
    baseURL: saved.baseURL ?? preset(provider)?.baseURL ?? "",
  };
}

/** The active config sent with each request. Defaults to Google + server key. */
export function getLlm(): LlmConfig {
  return getProviderConfig(readStore().current || "google");
}

export function setLlm(cfg: LlmConfig) {
  const s = readStore();
  s.byProvider[cfg.provider] = { model: cfg.model, apiKey: cfg.apiKey, baseURL: cfg.baseURL };
  s.current = cfg.provider;
  localStorage.setItem(KEY, JSON.stringify(s));
  // Pages gated on isLlmConfigured() listen for this to unblock immediately.
  if (typeof window !== "undefined") window.dispatchEvent(new Event("llm-config-changed"));
}

/** True when the active config can actually make a request (key + endpoint). */
export function isLlmConfigured(cfg: LlmConfig = getLlm()): boolean {
  if (!cfg.apiKey?.trim()) return false;
  const p = preset(cfg.provider);
  if (p?.kind === "compatible" || (cfg.provider !== "google" && cfg.baseURL)) {
    return !!(cfg.baseURL?.trim() || p?.baseURL);
  }
  return true;
}
