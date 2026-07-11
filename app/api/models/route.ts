// POST /api/models — list models the given provider/key supports, so the picker
// never shows a name that 404s. Gated by middleware (auth required).
import { NextResponse } from "next/server";
import { preset, type LlmConfig } from "@/lib/providers";

export async function POST(req: Request) {
  const cfg: Partial<LlmConfig> = await req.json().catch(() => ({}));
  const p = preset(cfg.provider || "google");

  try {
    if (p?.kind === "google" || !p) {
      const key = cfg.apiKey?.trim();
      if (!key) return NextResponse.json({ models: [] });
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`
      );
      if (!res.ok) return NextResponse.json({ models: [] }, { status: 502 });
      const data = (await res.json()) as {
        models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      };
      const models = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName ?? m.name }))
        .filter((m) => !/embedding|aqa|tts|image|imagen|veo/i.test(m.id))
        .sort((a, b) => a.id.localeCompare(b.id));
      return NextResponse.json({ models });
    }

    // OpenAI-compatible: GET {baseURL}/models with a Bearer key.
    const baseURL = (cfg.baseURL?.trim() || p.baseURL || "").replace(/\/$/, "");
    const key = cfg.apiKey?.trim();
    if (!baseURL || !key) return NextResponse.json({ models: [] });
    const res = await fetch(`${baseURL}/models`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!res.ok) return NextResponse.json({ models: [] }, { status: 502 });
    const data = (await res.json()) as { data?: { id: string }[] };
    const models = (data.data ?? [])
      .map((m) => ({ id: m.id, label: m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] }, { status: 502 });
  }
}
