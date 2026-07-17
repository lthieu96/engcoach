// POST /api/interview/cards — generate technical takeaway flashcards from a
// completed interview (docs/04). Returns candidates only; the user picks which
// to keep via POST /api/card (source "interview").
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError } from "@/lib/llm";
import { FlashcardBatch } from "@/lib/schemas";
import { interviewCardsSystem } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import type { InterviewKind } from "@/lib/interview";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 30;

type Body = { interviewId: string; llm?: Partial<LlmConfig> };

export async function POST(req: Request) {
  const { interviewId, llm }: Body = await req.json();
  if (!interviewId) return NextResponse.json({ error: "bad request" }, { status: 400 });

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
      .select("role, content")
      .eq("interview_id", interviewId)
      .order("idx"),
  ]);
  if (!interview || interview.status !== "completed")
    return NextResponse.json({ error: "no completed interview" }, { status: 409 });

  const prompt = `${(turns ?? [])
    .map((t) => `${t.role}: ${t.content}`)
    .join("\n")}\n\nEvaluation:\n${JSON.stringify(interview.evaluation)}`;

  try {
    const { object } = await generateObject({
      model: resolveModel(llm),
      schema: FlashcardBatch,
      system: interviewCardsSystem(interview.kind as InterviewKind, interview.question),
      prompt,
    });
    return NextResponse.json(object);
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }
}
