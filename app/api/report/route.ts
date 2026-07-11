// POST /api/report — end-of-session report (Spec §3.4) + persist the chat session.
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError } from "@/lib/llm";
import { SessionReport } from "@/lib/schemas";
import { sessionReportSystem } from "@/lib/prompts";
import { getLevel } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 30;

type Msg = { role: "user" | "assistant"; content: string };
type Body = { messages: Msg[]; scenario: string; llm?: Partial<LlmConfig> };

export async function POST(req: Request) {
  const { messages, scenario, llm }: Body = await req.json();
  if (!Array.isArray(messages) || !messages.length)
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Developer" : "Partner"}: ${m.content}`)
    .join("\n");

  let object;
  try {
    ({ object } = await generateObject({
      model: resolveModel(llm),
      schema: SessionReport,
      system: sessionReportSystem(await getLevel(supabase, user.id)),
      prompt: transcript,
    }));
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }

  await supabase.from("chat_sessions").insert({
    user_id: user.id,
    scenario,
    messages,
    report: object,
  });

  return NextResponse.json(object);
}
