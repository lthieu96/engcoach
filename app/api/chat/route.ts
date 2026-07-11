// POST /api/chat — one in-character roleplay turn (Spec §3.4). Streams plain
// text deltas so the client can render (and speak) the reply as it arrives.
import { streamText, createTextStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError } from "@/lib/llm";
import { chatSystem } from "@/lib/prompts";
import { getLevel } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 30;

type Msg = { role: "user" | "assistant"; content: string };
type Body = { messages: Msg[]; role: string; scenario: string; llm?: Partial<LlmConfig> };

export async function POST(req: Request) {
  const { messages, role, scenario, llm }: Body = await req.json();
  if (!Array.isArray(messages) || !role || !scenario)
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const level = await getLevel(supabase, user.id);
    const result = streamText({
      model: resolveModel(llm),
      system: chatSystem(role, scenario, level),
      messages,
    });
    return createTextStreamResponse({ stream: result.textStream });
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }
}
