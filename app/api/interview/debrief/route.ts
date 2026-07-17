// POST /api/interview/debrief — chat with the interviewer about the evaluation
// (docs/04 §3.3, HackerRank pattern). Nothing is persisted.
import { streamText, createTextStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError } from "@/lib/llm";
import { interviewDebriefSystem } from "@/lib/prompts";
import { getLevel } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { InterviewKind } from "@/lib/interview";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 30;

type Msg = { role: "user" | "assistant"; content: string };
type Body = { interviewId: string; messages: Msg[]; llm?: Partial<LlmConfig> };

export async function POST(req: Request) {
  const { interviewId, messages, llm }: Body = await req.json();
  if (!interviewId || !Array.isArray(messages) || !messages.length)
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: interview }, { data: turns }] = await Promise.all([
    supabase
      .from("interviews")
      .select("kind, question, status, evaluation")
      .eq("id", interviewId)
      .single(),
    supabase
      .from("interview_turns")
      .select("idx, role, content")
      .eq("interview_id", interviewId)
      .order("idx"),
  ]);
  if (!interview?.evaluation || interview.status !== "completed")
    return NextResponse.json({ error: "no evaluation to discuss" }, { status: 409 });

  const transcript = (turns ?? []).map((t) => `[${t.idx}] ${t.role}: ${t.content}`).join("\n");

  try {
    const result = streamText({
      model: resolveModel(llm),
      system: interviewDebriefSystem(
        interview.kind as InterviewKind,
        interview.question,
        transcript,
        JSON.stringify(interview.evaluation),
        await getLevel(supabase, user.id)
      ),
      messages,
    });
    return createTextStreamResponse({ stream: result.textStream });
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }
}
