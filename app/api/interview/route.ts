// POST /api/interview — create a mock interview (docs/04 §5): generate (or accept)
// the question, insert the interview + the interviewer's opening turn.
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError } from "@/lib/llm";
import { InterviewQuestion } from "@/lib/schemas";
import { interviewQuestionSystem } from "@/lib/prompts";
import { createClient } from "@/lib/supabase/server";
import {
  INTERVIEW_KINDS,
  SENIORITY,
  COMPANY_STYLES,
  KIND_LABEL,
  weakDimensions,
  type CompanyStyle,
  type Evaluation,
  type InterviewKind,
  type Seniority,
} from "@/lib/interview";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 30;

type Body = {
  kind: InterviewKind;
  level: Seniority;
  targetMinutes: number;
  question?: string;
  company?: CompanyStyle;
  topic?: string;
  code?: string;
  llm?: Partial<LlmConfig>;
};

export async function POST(req: Request) {
  const { kind, level, targetMinutes, question: userQuestion, company, topic, code, llm }: Body =
    await req.json();
  if (!INTERVIEW_KINDS.includes(kind) || !SENIORITY.includes(level))
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  // A deep dive with no topic has nothing to dive into.
  const cleanTopic = kind === "tech_deep_dive" ? topic?.trim().slice(0, 120) : undefined;
  if (kind === "tech_deep_dive" && !cleanTopic && !userQuestion?.trim())
    return NextResponse.json({ error: "pick a topic for the deep dive" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Recent sessions of this kind: questions feed the no-repeat rule, evaluations
  // feed the weak-dimension focus for the interviewer (deliberate practice).
  const { data: recent } = await supabase
    .from("interviews")
    .select("question, evaluation")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .order("started_at", { ascending: false })
    .limit(10);
  const focus = weakDimensions(
    (recent ?? []).flatMap((r) => (r.evaluation ? [r.evaluation as Evaluation] : [])).slice(0, 5)
  );

  let question = userQuestion?.trim();
  if (!question) {
    try {
      const { object } = await generateObject({
        model: resolveModel(llm),
        schema: InterviewQuestion,
        system: interviewQuestionSystem(
          kind,
          level,
          (recent ?? []).map((r) => r.question),
          cleanTopic
        ),
        prompt: "Generate one question now.",
      });
      question = object.question;
    } catch (e) {
      return NextResponse.json({ error: llmError(e) }, { status: 502 });
    }
  }

  const { data: interview, error } = await supabase
    .from("interviews")
    .insert({
      user_id: user.id,
      kind,
      question,
      config: {
        level,
        target_minutes: targetMinutes || 25,
        question_source: userQuestion ? "user" : "generated",
        company: COMPANY_STYLES.includes(company as CompanyStyle) ? company : "generic",
        topic: cleanTopic || undefined,
        // Code walkthrough is a DSA-only flow (docs/04 Phase 3).
        code: kind === "dsa_walkthrough" ? code?.trim() || undefined : undefined,
        focus: focus.length ? focus : undefined,
      },
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deterministic opener — no LLM call needed to say hello and read the question.
  const opener = `Hi, thanks for joining! Today we'll do a ${KIND_LABEL[kind]} interview${
    cleanTopic ? ` on ${cleanTopic}` : ""
  }. Here's the question:

${question}

Take a moment to think, and start whenever you're ready — clarifying questions are welcome.`;
  await supabase.from("interview_turns").insert({
    interview_id: interview.id,
    user_id: user.id,
    idx: 0,
    role: "interviewer",
    content: opener,
  });

  return NextResponse.json({ id: interview.id });
}
