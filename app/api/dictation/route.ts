// POST /api/dictation — a batch of short workplace sentences to dictate.
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError } from "@/lib/llm";
import { DictationBatch } from "@/lib/schemas";
import { dictationSystem } from "@/lib/prompts";
import { getLevel } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { llm }: { llm?: Partial<LlmConfig> } = await req.json().catch(() => ({}));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { object } = await generateObject({
      model: resolveModel(llm),
      schema: DictationBatch,
      system: dictationSystem(await getLevel(supabase, user.id)),
      prompt: "Generate the sentences now.",
    });
    return NextResponse.json(object);
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }
}
