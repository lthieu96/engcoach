"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Copy01 as Copy,
  Send01 as Send,
  RefreshCw01 as RefreshCw,
  Trash01 as Trash,
} from "@untitledui/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AsciiSpinner } from "@/components/ascii-spinner";
import { getLlm } from "@/lib/providers";
import type { Flashcard, SessionReport } from "@/lib/schemas";
import {
  KIND_LABEL,
  DIMENSION_LABEL,
  OVERALL_LABEL,
  SENIORITY_LABEL,
  COMPANY_LABEL,
  type Evaluation,
  type InterviewConfig,
  type InterviewKind,
} from "@/lib/interview";

type Turn = { idx: number; role: "interviewer" | "candidate"; content: string };

const PHASE_LABEL: Record<string, string> = {
  requirements: "Requirements",
  api_and_entities: "API & entities",
  high_level_design: "High-level design",
  deep_dives: "Deep dives",
  wrap_up: "Wrap-up",
  problem_understanding: "Problem understanding",
  approach: "Approach",
  complexity: "Complexity",
  edge_cases: "Edge cases",
};

function scoreTone(score: number) {
  return score >= 3 ? "text-primary" : score === 2 ? "text-amber-600 dark:text-amber-500" : "text-destructive";
}


export function InterviewReplay({
  id,
  kind,
  config,
  startedAt,
  endedAt,
  question,
  turns,
  evaluation,
  english,
}: {
  id: string;
  kind: InterviewKind;
  config: InterviewConfig;
  startedAt: string;
  endedAt: string | null;
  question: string;
  turns: Turn[];
  evaluation: Evaluation | null;
  english: SessionReport | null;
}) {
  const router = useRouter();
  const [addedCards, setAddedCards] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [takeaways, setTakeaways] = useState<Flashcard[] | null>(null);
  const [generating, setGenerating] = useState(false);

  // Technical knowledge cards from the interview — join the same FSRS deck.
  async function generateTakeaways() {
    setGenerating(true);
    try {
      const res = await fetch("/api/interview/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewId: id, llm: getLlm() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate flashcards");
      setTakeaways(data.cards);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate flashcards");
    } finally {
      setGenerating(false);
    }
  }
  const phaseStart = new Map((evaluation?.phases ?? []).map((p) => [p.from_idx, p.phase]));

  // Deletes the interview row; the FK cascade removes its turns. Cards created
  // from it are independent rows and stay in the Review deck.
  async function deleteInterview() {
    const { error } = await createClient().from("interviews").delete().eq("id", id);
    if (error) {
      toast.error(`Couldn't delete: ${error.message}`);
      return;
    }
    toast.success("Interview deleted");
    router.replace("/interviews");
    router.refresh();
  }

  // Same question, same bar, fresh session — deliberate practice (docs/04).
  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          level: config.level,
          targetMinutes: config.target_minutes,
          company: config.company,
          question,
          code: config.code,
          llm: getLlm(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the retry");
      router.push(`/interviews/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the retry");
      setRetrying(false);
    }
  }

  // Markdown export — paste into the Obsidian vault (docs/04 Phase 3).
  async function copyMarkdown() {
    const md = [
      `# Mock Interview — ${KIND_LABEL[kind]}`,
      `\n> ${question}\n`,
      evaluation &&
        `## Evaluation — ${OVERALL_LABEL[evaluation.overall] ?? evaluation.overall}\n\n${
          evaluation.summary
        }\n\n${evaluation.rubric
          .map((r) => `- **${DIMENSION_LABEL[r.dimension] ?? r.dimension}: ${r.score}/4** — ${r.feedback}`)
          .join("\n")}\n\n${evaluation.action_items.map((a) => `- [ ] ${a}`).join("\n")}`,
      `## Transcript\n\n${turns
        .map((t) => `**${t.role === "candidate" ? "Me" : "Interviewer"}:** ${t.content}`)
        .join("\n\n")}`,
    ]
      .filter(Boolean)
      .join("\n");
    await navigator.clipboard.writeText(md);
    toast.success("Markdown copied");
  }

  function jumpTo(idx: number) {
    const el = document.getElementById(`turn-${idx}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.animate([{ backgroundColor: "color-mix(in oklab, var(--primary) 15%, transparent)" }, {}], {
      duration: 1500,
    });
  }

  async function addCard(key: string, front: string, back: string) {
    setAddedCards((s) => new Set(s).add(key));
    try {
      const res = await fetch("/api/card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ front, back, source: "interview" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Flashcard added");
    } catch {
      setAddedCards((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
      toast.error("Couldn't add flashcard");
    }
  }

  const mins = endedAt
    ? Math.max(1, Math.round((+new Date(endedAt) - +new Date(startedAt)) / 60000))
    : null;

  const overall = evaluation?.overall ?? 0;
  // Verdict color drives the hero's accents: wash, panel, segments.
  const verdictWash =
    overall >= 3
      ? "from-primary/10"
      : overall === 2
        ? "from-amber-500/10"
        : overall === 1
          ? "from-destructive/10"
          : "from-transparent";
  const verdictPanel =
    overall >= 3
      ? "border-primary/40 bg-primary/10 text-primary"
      : overall === 2
        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500"
        : "border-destructive/40 bg-destructive/10 text-destructive";
  const segmentFill = (s: number, score: number) =>
    s > score
      ? "bg-muted"
      : score >= 3
        ? "bg-primary"
        : score === 2
          ? "bg-amber-500"
          : "bg-destructive";

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      {/* Hero: verdict, question, summary, next steps */}
      <header className="relative overflow-hidden rounded-xl border bg-card shadow-xs">
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent ${verdictWash}`}
        />
        <div className="relative space-y-4 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge>{KIND_LABEL[kind]}</Badge>
              <Badge variant="outline">{SENIORITY_LABEL[config.level] ?? config.level}</Badge>
              {config.company && config.company !== "generic" && (
                <Badge variant="outline">{COMPANY_LABEL[config.company]} style</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(startedAt).toLocaleDateString()}
                {mins ? ` · ${mins} min` : ""} · {turns.length} turns
              </span>
            </div>
            <span className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-muted-foreground"
                onClick={copyMarkdown}
              >
                <Copy className="size-3.5" /> Markdown
              </Button>
              <Button variant="outline" size="sm" className="h-7" onClick={retry} disabled={retrying}>
                <RefreshCw className={`size-3.5 ${retrying ? "animate-spin" : ""}`} /> Retry
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button variant="ghost" size="sm" className="h-7 text-muted-foreground" />}
                >
                  <Trash className="size-3.5" />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this interview?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Permanently removes the transcript, evaluation and English report. Flashcards
                      you already added stay in the Review deck.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deleteInterview}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </span>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-3xl text-base font-medium leading-snug">{question}</p>
            {evaluation && (
              <div
                className={`flex w-full shrink-0 flex-col items-center gap-1.5 rounded-xl border p-3.5 sm:w-32 ${verdictPanel}`}
              >
                <span className="text-3xl font-bold leading-none tabular-nums">
                  {evaluation.overall}
                  <span className="text-sm font-medium opacity-60">/4</span>
                </span>
                <span className="text-center text-xs font-semibold">
                  {OVERALL_LABEL[evaluation.overall] ?? evaluation.overall}
                </span>
                <div className="flex w-full gap-0.5" aria-hidden>
                  {[1, 2, 3, 4].map((s) => (
                    <span
                      key={s}
                      className={`h-1 flex-1 rounded-full ${segmentFill(s, evaluation.overall)}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {evaluation && (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {evaluation.summary}
            </p>
          )}
          {evaluation && evaluation.action_items.length > 0 && (
            <div className="rounded-lg border bg-muted/40 p-3.5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Next steps
              </p>
              <ul className="space-y-1.5 text-sm">
                {evaluation.action_items.map((a, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="font-semibold tabular-nums text-primary">{i + 1}.</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      {/* Transcript */}
      <div className="space-y-3 lg:order-1">
        <div className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
          {turns.map((t) => (
            <div key={t.idx}>
              {phaseStart.has(t.idx) && (
                <div className="mb-3 flex items-center gap-2 pt-1">
                  <div className="h-px flex-1 bg-border" />
                  <Badge variant="outline">{PHASE_LABEL[phaseStart.get(t.idx)!] ?? phaseStart.get(t.idx)}</Badge>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <Message align={t.role === "candidate" ? "end" : "start"}>
                <MessageContent>
                  <Bubble
                    id={`turn-${t.idx}`}
                    variant={t.role === "candidate" ? "default" : "muted"}
                    align={t.role === "candidate" ? "end" : "start"}
                  >
                    <BubbleContent className="whitespace-pre-wrap text-[15px] leading-relaxed">
                      {t.content}
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            </div>
          ))}
        </div>
      </div>

      {/* Evaluation panel — tabs so only one section competes for attention;
          sticky so it follows while scrolling the transcript (evidence jumps).
          The tab bar stays put; each panel scrolls on its own, so switching
          tabs never lands on a blank scrolled-away view. */}
      <div className="self-start lg:sticky lg:top-6 lg:order-2">
        <Tabs defaultValue={evaluation ? "rubric" : "english"}>
          <TabsList className="w-full">
            {evaluation && (
              <TabsTrigger value="rubric" className="flex-1">
                Rubric
              </TabsTrigger>
            )}
            {english && (
              <TabsTrigger value="english" className="flex-1">
                English
              </TabsTrigger>
            )}
            {evaluation && (
              <TabsTrigger value="cards" className="flex-1">
                Cards
              </TabsTrigger>
            )}
            {evaluation && (
              <TabsTrigger value="ask" className="flex-1">
                Ask
              </TabsTrigger>
            )}
          </TabsList>

        {evaluation && (
          <TabsContent value="rubric" keepMounted className="pt-3 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            <Card>
              <CardContent className="space-y-4 py-4">
                {evaluation.rubric.map((r) => (
                  <div key={r.dimension} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{DIMENSION_LABEL[r.dimension] ?? r.dimension}</span>
                      <span className={`font-semibold tabular-nums ${scoreTone(r.score)}`}>{r.score}/4</span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((s) => (
                        <div
                          key={s}
                          className={`h-1.5 flex-1 rounded-full ${segmentFill(s, r.score)}`}
                        />
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{r.feedback}</p>
                    {r.evidence.map((e, i) => (
                      <button
                        key={i}
                        onClick={() => jumpTo(e.turn_idx)}
                        className="block w-full truncate rounded-md border bg-muted/40 px-2 py-1 text-left text-xs italic text-muted-foreground transition-colors hover:bg-muted"
                        title="Jump to this moment"
                      >
                        &ldquo;{e.quote}&rdquo;
                      </button>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {evaluation && (
          <TabsContent value="cards" keepMounted className="pt-3 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            <Card>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium">Technical takeaways</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={generateTakeaways}
                    disabled={generating}
                  >
                    {generating ? "Generating…" : takeaways ? "Regenerate" : "Generate flashcards"}
                  </Button>
                </div>
                {!takeaways && !generating && (
                  <p className="text-sm text-muted-foreground">
                    Turn the concepts from this interview — especially your weak spots — into
                    flashcards for the Review deck.
                  </p>
                )}
                {takeaways?.map((c, i) => (
                  <ReportItem
                    key={`t${i}`}
                    added={addedCards.has(`t${i}`)}
                    onAdd={() => addCard(`t${i}`, c.front, c.back)}
                  >
                    <span className="font-medium">{c.front}</span>
                    <p className="mt-0.5 text-muted-foreground">{c.back}</p>
                  </ReportItem>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {evaluation && (
          <TabsContent value="ask" keepMounted className="pt-3 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            <DebriefChat interviewId={id} />
          </TabsContent>
        )}

        {english && (
          <TabsContent value="english" keepMounted className="pt-3 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
          <Card>
            <CardContent className="space-y-3 py-4">
              <h2 className="text-sm font-medium">English report</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{english.fluency_note}</p>
              {english.corrections.map((c, i) => (
                <ReportItem
                  key={`c${i}`}
                  added={addedCards.has(`c${i}`)}
                  onAdd={() =>
                    addCard(`c${i}`, `Fix: "${c.original}" (${c.rule_tag})`, `${c.replacement}\n${c.explanation}`)
                  }
                >
                  <span className="text-muted-foreground line-through">{c.original}</span>{" "}
                  <span className="font-semibold">{c.replacement}</span>
                  <p className="mt-0.5 text-muted-foreground">{c.explanation}</p>
                </ReportItem>
              ))}
              {english.better_phrasings.map((p, i) => (
                <ReportItem
                  key={`p${i}`}
                  added={addedCards.has(`p${i}`)}
                  onAdd={() => addCard(`p${i}`, `Say better: "${p.you_said}"`, `${p.better}\n(${p.why})`)}
                >
                  <span className="text-muted-foreground line-through">{p.you_said}</span>{" "}
                  <span className="font-semibold">{p.better}</span>
                  <p className="mt-0.5 text-muted-foreground">{p.why}</p>
                </ReportItem>
              ))}
              {english.new_vocabulary.map((v, i) => (
                <ReportItem
                  key={`v${i}`}
                  added={addedCards.has(`v${i}`)}
                  onAdd={() => addCard(`v${i}`, `${v.term}?`, `${v.meaning}\ne.g. ${v.example}`)}
                >
                  <span className="font-semibold">{v.term}</span> — {v.meaning}
                  <p className="mt-0.5 text-muted-foreground">e.g. {v.example}</p>
                </ReportItem>
              ))}
            </CardContent>
          </Card>
          </TabsContent>
        )}
        </Tabs>
      </div>
      </div>
    </div>
  );
}

// Ask the interviewer about the grade (docs/04 §3.3). Ephemeral — not persisted.
function DebriefChat({ interviewId }: { interviewId: string }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);

  async function send() {
    const content = draft.trim();
    if (!content || streaming) return;
    setDraft("");
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setStreaming(true);
    try {
      const res = await fetch("/api/interview/debrief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interviewId, messages: next, llm: getLlm() }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Debrief failed");
      }
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        const snapshot = full;
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: snapshot }]);
      }
    } catch (e) {
      setMessages((m) => (m.at(-1)?.role === "assistant" && !m.at(-1)?.content ? m.slice(0, -1) : m));
      toast.error(e instanceof Error ? e.message : "Debrief failed");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <h2 className="text-sm font-medium">Ask the interviewer</h2>
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Question about a score? Ask — e.g. &ldquo;what would a 4 on trade-offs have looked
            like?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <Message key={i} align={m.role === "user" ? "end" : "start"}>
            <MessageContent>
              <Bubble variant={m.role === "user" ? "default" : "muted"} align={m.role === "user" ? "end" : "start"}>
                <BubbleContent className="whitespace-pre-wrap text-sm leading-relaxed">
                  {m.content}
                </BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        ))}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask about your evaluation…"
            rows={1}
            className="min-h-0 flex-1 resize-none"
          />
          <Button onClick={send} disabled={streaming || !draft.trim()} size="icon" className="shrink-0">
            {streaming ? <AsciiSpinner /> : <Send className="size-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportItem({
  children,
  onAdd,
  added,
}: {
  children: React.ReactNode;
  onAdd: () => void;
  added: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="flex-1">{children}</div>
      <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={onAdd} disabled={added}>
        <Plus className="size-3.5" /> {added ? "Added" : "Card"}
      </Button>
    </div>
  );
}
