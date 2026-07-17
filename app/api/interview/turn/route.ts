// POST /api/interview/turn — one interview turn (docs/04 §5). Persists the
// candidate's message immediately (crash-safe), streams the interviewer's reply,
// and persists it when the stream completes.
import { streamText, createTextStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError } from "@/lib/llm";
import { interviewerSystem } from "@/lib/prompts";
import { getLevel } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { InterviewConfig, InterviewKind } from "@/lib/interview";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 30;

// Gemini rejects a history that opens with an assistant message; the interview
// always starts with the interviewer's turn 0, so seed a hidden user opener.
const SEED = { role: "user" as const, content: "(I've joined the interview. Please begin.)" };

type Body = { interviewId: string; content: string; llm?: Partial<LlmConfig> };

export async function POST(req: Request) {
  const { interviewId, content, llm }: Body = await req.json();
  if (!interviewId || !content?.trim())
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: interview } = await supabase
    .from("interviews")
    .select("id, kind, question, config, status, started_at")
    .eq("id", interviewId)
    .single();
  if (!interview) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (interview.status !== "active")
    return NextResponse.json({ error: "interview is finished" }, { status: 409 });

  const { data: turns } = await supabase
    .from("interview_turns")
    .select("idx, role, content")
    .eq("interview_id", interviewId)
    .order("idx");
  const nextIdx = (turns?.at(-1)?.idx ?? -1) + 1;

  const { error: insertErr } = await supabase.from("interview_turns").insert({
    interview_id: interviewId,
    user_id: user.id,
    idx: nextIdx,
    role: "candidate",
    content: content.trim(),
  });
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const cfg = interview.config as InterviewConfig;
  const elapsedMin = Math.round((Date.now() - new Date(interview.started_at).getTime()) / 60000);
  const history = [
    SEED,
    ...(turns ?? []).map((t) => ({
      role: t.role === "candidate" ? ("user" as const) : ("assistant" as const),
      content: t.content,
    })),
    { role: "user" as const, content: content.trim() },
  ];
  // Merge consecutive same-role messages (a crash can leave a candidate turn with
  // no reply) — some providers require strict user/assistant alternation.
  const messages = history.reduce<typeof history>((acc, m) => {
    const last = acc.at(-1);
    if (last && last.role === m.role) last.content += `\n${m.content}`;
    else acc.push({ ...m });
    return acc;
  }, []);

  try {
    const result = streamText({
      model: resolveModel(llm),
      system: interviewerSystem(
        interview.kind as InterviewKind,
        interview.question,
        cfg.level,
        await getLevel(supabase, user.id),
        elapsedMin,
        cfg.target_minutes,
        cfg.company,
        cfg.code,
        cfg.focus
      ),
      messages,
      onFinish: async ({ text }) => {
        if (!text.trim()) return;
        await supabase.from("interview_turns").insert({
          interview_id: interviewId,
          user_id: user.id,
          idx: nextIdx + 1,
          role: "interviewer",
          content: text,
        });
      },
    });
    return createTextStreamResponse({ stream: result.textStream });
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }
}
