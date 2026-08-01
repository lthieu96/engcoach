// POST /api/interview/finish — grade the interview (docs/04 §5): technical rubric
// + English report as two separate calls, then close the interview row.
// maxDuration 60: two sequential generateObject calls over the full transcript.
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError, GRADING } from "@/lib/llm";
import { interviewEvaluationSchema, SessionReport } from "@/lib/schemas";
import { interviewEvalSystem, sessionReportSystem } from "@/lib/prompts";
import { getLevel } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { validateEvaluation, type Evaluation, type InterviewConfig, type InterviewKind } from "@/lib/interview";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 60;

type Body = { interviewId: string; llm?: Partial<LlmConfig> };

export async function POST(req: Request) {
  const { interviewId, llm }: Body = await req.json();
  if (!interviewId) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: interview } = await supabase
    .from("interviews")
    .select("id, kind, question, config, status, evaluation")
    .eq("id", interviewId)
    .single();
  if (!interview) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (interview.status !== "active")
    return NextResponse.json({ error: "already finished" }, { status: 409 });

  const { data: turns } = await supabase
    .from("interview_turns")
    .select("idx, role, content")
    .eq("interview_id", interviewId)
    .order("idx");

  // Nothing to grade — the candidate never spoke.
  if (!turns?.some((t) => t.role === "candidate")) {
    await supabase
      .from("interviews")
      .update({ status: "abandoned", ended_at: new Date().toISOString() })
      .eq("id", interviewId)
      .eq("status", "active");
    return NextResponse.json({ abandoned: true });
  }

  const kind = interview.kind as InterviewKind;
  const cfg = interview.config as InterviewConfig;
  const numbered = turns.map((t) => `[${t.idx}] ${t.role}: ${t.content}`).join("\n");
  const plain = turns
    .map((t) => `${t.role === "candidate" ? "Developer" : "Interviewer"}: ${t.content}`)
    .join("\n");

  // A previous finish attempt may have graded the rubric and then failed on the
  // English call — reuse the saved evaluation so retries don't re-pay for it.
  let evaluation = interview.evaluation as Evaluation | null;
  let english: SessionReport;
  try {
    const level = await getLevel(supabase, user.id);
    if (!evaluation) {
      const evalRes = await generateObject({
        ...GRADING,
        model: resolveModel(llm),
        schema: interviewEvaluationSchema(kind, !!cfg.code),
        system: interviewEvalSystem(kind, interview.question, cfg.level, cfg.company, cfg.code),
        prompt: numbered,
      });
      evaluation = validateEvaluation(evalRes.object as Evaluation, turns);
      await supabase
        .from("interviews")
        .update({ evaluation, overall_score: evaluation.overall })
        .eq("id", interviewId)
        .eq("status", "active");
    }
    const reportRes = await generateObject({
      ...GRADING,
      model: resolveModel(llm),
      schema: SessionReport,
      system: sessionReportSystem(level),
      prompt: plain,
    });
    english = reportRes.object;
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }

  // Guarded by status so a concurrent finish (second tab) can't overwrite.
  const { data: updated, error } = await supabase
    .from("interviews")
    .update({
      status: "completed",
      evaluation,
      english_report: english,
      overall_score: evaluation.overall,
      ended_at: new Date().toISOString(),
    })
    .eq("id", interviewId)
    .eq("status", "active")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated?.length) return NextResponse.json({ error: "already finished" }, { status: 409 });

  return NextResponse.json({ evaluation, english_report: english });
}
