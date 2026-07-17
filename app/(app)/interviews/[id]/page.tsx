// One interview: live session while `active`, replay + report once finished.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InterviewSession } from "@/components/interview/interview-session";
import { InterviewReplay } from "@/components/interview/interview-replay";
import type { Evaluation, InterviewConfig, InterviewKind } from "@/lib/interview";
import type { SessionReport } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: interview }, { data: turns }] = await Promise.all([
    supabase
      .from("interviews")
      .select("id, kind, question, config, status, evaluation, english_report, started_at, ended_at")
      .eq("id", id)
      .single(),
    supabase
      .from("interview_turns")
      .select("idx, role, content")
      .eq("interview_id", id)
      .order("idx"),
  ]);
  if (!interview) notFound();

  const kind = interview.kind as InterviewKind;
  const cfg = interview.config as InterviewConfig;
  const turnRows = (turns ?? []) as { idx: number; role: "interviewer" | "candidate"; content: string }[];

  if (interview.status === "active") {
    return (
      <InterviewSession
        id={interview.id}
        kind={kind}
        startedAt={interview.started_at}
        targetMinutes={cfg.target_minutes ?? 25}
        initialTurns={turnRows}
      />
    );
  }

  return (
    <InterviewReplay
      id={interview.id}
      kind={kind}
      config={cfg}
      startedAt={interview.started_at}
      endedAt={interview.ended_at}
      question={interview.question}
      turns={turnRows}
      evaluation={interview.evaluation as Evaluation | null}
      english={interview.english_report as SessionReport | null}
    />
  );
}
