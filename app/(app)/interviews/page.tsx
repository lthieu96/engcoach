// Mock interview home (docs/04 §3.4): stats → score trends → history.
import Link from "next/link";
import {
  Briefcase01 as Briefcase,
  Target01 as Target,
  TrendUp01 as TrendUp,
  Clock,
} from "@untitledui/icons";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { NewInterview } from "@/components/interview/new-interview";
import { ScoreTrend, type TrendPoint } from "@/components/interview/score-trend";
import { StatTile } from "@/components/dashboard/charts";
import {
  INTERVIEW_KINDS,
  KIND_LABEL,
  SENIORITY_LABEL,
  COMPANY_LABEL,
  OVERALL_LABEL,
  RUBRICS,
  type Evaluation,
  type InterviewConfig,
  type InterviewKind,
} from "@/lib/interview";

export const dynamic = "force-dynamic";

const SCORE_RING: Record<number, string> = {
  1: "border-destructive/60 text-destructive",
  2: "border-amber-500/60 text-amber-600 dark:text-amber-500",
  3: "border-primary/60 text-primary",
  4: "border-primary text-primary",
};

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - +new Date(iso)) / 864e5);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function InterviewsPage() {
  const supabase = await createClient();
  const { data: interviews } = await supabase
    .from("interviews")
    .select("id, kind, question, config, status, overall_score, evaluation, started_at, ended_at")
    .order("started_at", { ascending: false })
    .limit(50);

  const rows = (interviews ?? []).filter((i) => i.status !== "abandoned");
  const completed = rows.filter((i) => i.status === "completed" && i.overall_score);
  const hires = completed.filter((i) => i.overall_score! >= 3).length;
  const minutes = completed.reduce(
    (n, i) => n + (i.ended_at ? Math.round((+new Date(i.ended_at) - +new Date(i.started_at)) / 60000) : 0),
    0
  );
  const latest = completed[0];

  // Per-dimension trend, oldest → newest, one series per kind.
  const trends = new Map<InterviewKind, TrendPoint[]>();
  for (const i of [...rows].reverse()) {
    const ev = i.evaluation as Evaluation | null;
    if (i.status !== "completed" || !ev?.rubric) continue;
    const kind = i.kind as InterviewKind;
    if (!trends.has(kind)) trends.set(kind, []);
    trends.get(kind)!.push({
      date: i.started_at,
      scores: Object.fromEntries(ev.rubric.map((r) => [r.dimension, r.score])),
    });
  }
  const trendCards = INTERVIEW_KINDS.filter((k) => (trends.get(k)?.length ?? 0) >= 2);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Interviews</h1>
          <p className="text-sm text-muted-foreground">
            Graded on real hiring rubrics — technical and English feedback, every session.
          </p>
        </div>
        <NewInterview />
      </div>

      {completed.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Completed"
            value={String(completed.length)}
            sub="mock interviews"
            icon={<Briefcase />}
          />
          <StatTile
            label="Hire rate"
            value={`${Math.round((hires / completed.length) * 100)}%`}
            sub="scored Leaning Hire+"
            icon={<Target />}
          />
          <StatTile
            label="Latest"
            value={latest ? `${latest.overall_score}/4` : "—"}
            sub={latest ? OVERALL_LABEL[latest.overall_score!] : ""}
            icon={<TrendUp />}
          />
          <StatTile
            label="Time practiced"
            value={minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`}
            sub="in the hot seat"
            icon={<Clock />}
          />
        </div>
      )}

      {trendCards.length > 0 && (
        <div className={`grid gap-4 ${trendCards.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {trendCards.map((k) => (
            <ScoreTrend key={k} kind={k} points={trends.get(k)!} />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl border bg-background shadow-xs">
            <Briefcase className="size-6 text-muted-foreground" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">No interviews yet</p>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Start a System Design interview — answer in chat, get graded like a real loop, and
              review the replay anytime.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">History</h2>
          <div className="grid gap-3">
            {rows.map((i) => {
              const cfg = i.config as InterviewConfig;
              const ev = i.evaluation as Evaluation | null;
              const kind = i.kind as InterviewKind;
              const dims = RUBRICS[kind].map((d) => d.id);
              const scoreByDim = new Map((ev?.rubric ?? []).map((r) => [r.dimension, r.score]));
              const mins = i.ended_at
                ? Math.max(1, Math.round((+new Date(i.ended_at) - +new Date(i.started_at)) / 60000))
                : null;
              return (
                <Link
                  key={i.id}
                  href={`/interviews/${i.id}`}
                  className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted/50"
                >
                  {/* Overall score ring */}
                  {i.status === "active" ? (
                    <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/60">
                      <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-primary/60" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                    </span>
                  ) : (
                    <span
                      className={`flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold tabular-nums ${
                        SCORE_RING[i.overall_score ?? 0] ?? "border-muted text-muted-foreground"
                      }`}
                    >
                      {i.overall_score ?? "—"}
                    </span>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{i.question}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{KIND_LABEL[kind]}</span>
                      <span>· {SENIORITY_LABEL[cfg.level] ?? cfg.level}</span>
                      {cfg.company && cfg.company !== "generic" && (
                        <span>· {COMPANY_LABEL[cfg.company]} style</span>
                      )}
                      <span>· {relativeDate(i.started_at)}</span>
                      {mins && <span>· {mins} min</span>}
                    </p>
                  </div>

                  {/* Per-dimension mini bars (completed only) */}
                  {ev && (
                    <div className="hidden shrink-0 items-end gap-1 sm:flex" aria-hidden>
                      {dims.map((d) => {
                        const s = scoreByDim.get(d) ?? 0;
                        return (
                          <span
                            key={d}
                            title={d}
                            className={`w-1.5 rounded-sm ${s >= 3 ? "bg-primary" : s === 2 ? "bg-amber-500" : s === 1 ? "bg-destructive" : "bg-muted"}`}
                            style={{ height: `${8 + s * 7}px` }}
                          />
                        );
                      })}
                    </div>
                  )}

                  {i.status === "active" ? (
                    <Badge variant="outline" className="shrink-0">
                      In progress
                    </Badge>
                  ) : i.overall_score ? (
                    <Badge
                      variant={i.overall_score >= 3 ? "default" : "secondary"}
                      className="hidden shrink-0 sm:inline-flex"
                    >
                      {OVERALL_LABEL[i.overall_score]}
                    </Badge>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
