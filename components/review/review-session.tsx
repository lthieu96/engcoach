"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AsciiSpinner } from "@/components/ascii-spinner";
import { Kbd } from "@/components/ui/kbd";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { openLlmSettings } from "@/components/llm-setup-notice";
import { postLlm } from "@/lib/api";
import { grammarAnswerMatches } from "@/lib/grammar";
import { createClient } from "@/lib/supabase/client";
import { fromDb, review, intervals, Rating, type Grade } from "@/lib/fsrs";
import { isLlmConfigured } from "@/lib/providers";
import type { GrammarDrillBatch } from "@/lib/schemas";
import { grammarPatterns } from "@/lib/stats";
import { matches } from "@/lib/vocab";

type Mode = "due" | "vocab" | "grammar";
type CardKind = "sentence" | "vocab";
type CardRow = {
  id: string;
  kind: CardKind;
  front: string;
  back: string;
  example: string | null;
  fsrs: unknown;
  due: string;
};
type VocabRow = Pick<CardRow, "id" | "front" | "back" | "example"> & {
  seen_count: number;
};
type CorrectionRow = {
  rule_tag: string;
  original: string;
  replacement: string;
  explanation: string;
  created_at: string;
};
type GrammarPattern = ReturnType<typeof grammarPatterns>[number];
type Drill = { tag: string; items: GrammarDrillBatch["items"]; index: number; score: number };
const BATCH = 30;
const MODES: { id: Mode; label: string }[] = [
  { id: "due", label: "Due" },
  { id: "vocab", label: "Vocabulary" },
  { id: "grammar", label: "Grammar" },
];

export function ReviewSession() {
  const supabase = useRef(createClient());
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("due");
  const [queue, setQueue] = useState<CardRow[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabRow[]>([]);
  const [patterns, setPatterns] = useState<ReturnType<typeof grammarPatterns>>([]);
  const [generatingTag, setGeneratingTag] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [drillAnswer, setDrillAnswer] = useState("");
  const [drillResult, setDrillResult] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [reviewed, setReviewed] = useState(0);
  const [passed, setPassed] = useState(0);

  // Load the practice queue and both reference views together so tab switches are instant.
  const load = useCallback(async () => {
    setLoading(true);
    const [dueResult, vocabResult, grammarResult] = await Promise.all([
      supabase.current
        .from("cards")
        .select("id, kind, front, back, example, fsrs, due")
        .lte("due", new Date().toISOString())
        .order("due")
        .limit(BATCH),
      supabase.current
        .from("cards")
        .select("id, front, back, example, seen_count")
        .eq("kind", "vocab")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.current
        .from("corrections")
        .select("rule_tag, original, replacement, explanation, created_at")
        .eq("category", "grammar")
        .neq("status", "dismissed")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const error = dueResult.error ?? vocabResult.error ?? grammarResult.error;
    if (error) toast.error(`Couldn't load Review: ${error.message}`);
    setQueue((dueResult.data as CardRow[]) ?? []);
    setVocabulary((vocabResult.data as VocabRow[]) ?? []);
    setPatterns(grammarPatterns((grammarResult.data as CorrectionRow[]) ?? []));
    setRevealed(false);
    setTyped("");
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.current.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    load();
  }, [load]);

  const current = queue[0];
  const state = current ? fromDb(current.fsrs) : null;
  const preview: Record<Grade, string> | null = state ? intervals(state) : null;

  // Vocab alternates direction: first sight is recognition (EN → VI), every
  // later review is production (VI → EN) — the harder, more useful direction.
  const produce = current?.kind === "vocab" && (state?.reps ?? 0) > 0;
  const question = current?.kind === "vocab" && produce ? current.back : current?.front;
  const answer = current?.kind === "vocab" && produce ? current?.front : current?.back;
  const correct = current?.kind === "vocab" && revealed ? matches(typed, answer ?? "") : null;
  const cardLabel =
    current?.kind === "vocab"
      ? produce
        ? "Viết bằng tiếng Anh"
        : "Nghĩa tiếng Việt là gì?"
      : "Sentence card";

  const rate = useCallback(
    (rating: Grade) => {
      const card = queue[0];
      if (!card || !userId) return;

      const { card: next, due } = review(fromDb(card.fsrs), rating);

      // Persist in the background so rating stays snappy (report failures, don't block).
      supabase.current
        .from("cards")
        .update({ fsrs: next, due: due.toISOString() })
        .eq("id", card.id)
        .then(({ error }) => error && toast.error(`Couldn't save review: ${error.message}`));
      supabase.current
        .from("review_logs")
        .insert({ card_id: card.id, user_id: userId, rating })
        .then(({ error }) => error && toast.error(`Couldn't log review: ${error.message}`));

      setReviewed((n) => n + 1);
      if (rating !== Rating.Again) setPassed((n) => n + 1);
      setRevealed(false);
      setTyped("");
      setQueue((cards) => {
        const [, ...rest] = cards;
        // Again → relearn this session; its answer hides again on requeue.
        return rating === Rating.Again
          ? [...rest, { ...card, fsrs: next, due: due.toISOString() }]
          : rest;
      });
    },
    [queue, userId]
  );

  // Keyboard: Space reveals, then Space=Good, 1=Again, 2=Hard, 3=Good, 4=Easy.
  // While the vocab answer box has focus the keys belong to the box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mode !== "due" || !current) return;
      if (document.activeElement?.tagName === "INPUT") return;
      if (!revealed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }
      const map: Record<string, Grade> = {
        "1": Rating.Again,
        "2": Rating.Hard,
        "3": Rating.Good,
        "4": Rating.Easy,
        " ": Rating.Good,
        Enter: Rating.Good,
      };
      const r = map[e.key];
      if (r) {
        e.preventDefault();
        rate(r);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, current, revealed, rate]);

  function switchMode(next: Mode) {
    setMode(next);
    setRevealed(false);
    setTyped("");
  }

  async function startDrill(pattern: GrammarPattern) {
    if (!isLlmConfigured()) {
      openLlmSettings();
      return;
    }
    setGeneratingTag(pattern.tag);
    try {
      const generated = await postLlm<GrammarDrillBatch>("/api/grammar", {
        ruleTag: pattern.tag,
        examples: pattern.examples,
      });
      setDrill({ tag: pattern.tag, items: generated.items, index: 0, score: 0 });
      setDrillAnswer("");
      setDrillResult(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate practice");
    } finally {
      setGeneratingTag(null);
    }
  }

  function checkDrillAnswer() {
    const item = drill?.items[drill.index];
    if (!item || !drillAnswer.trim() || drillResult !== null) return;
    const correct = grammarAnswerMatches(drillAnswer, item.answer);
    setDrillResult(correct);
    if (correct) setDrill((current) => (current ? { ...current, score: current.score + 1 } : null));
  }

  function nextDrillQuestion() {
    setDrill((current) => (current ? { ...current, index: current.index + 1 } : null));
    setDrillAnswer("");
    setDrillResult(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <AsciiSpinner label="Loading deck…" className="text-base text-muted-foreground" />
      </div>
    );
  }

  const counts: Record<Mode, number> = {
    due: queue.length,
    vocab: vocabulary.length,
    grammar: patterns.length,
  };
  const tabs = (
    <Tabs value={mode} onValueChange={(value) => switchMode(value as Mode)}>
      <TabsList>
        {MODES.map((item) => (
          <TabsTrigger key={item.id} value={item.id}>
            {item.label}
            {counts[item.id] > 0 && (
              <span className="ml-1 tabular-nums text-muted-foreground">{counts[item.id]}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Review</h1>
      {tabs}
    </div>
  );

  if (mode === "vocab") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
        {header}
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Vocabulary phrases</h2>
          <p className="text-sm text-muted-foreground">
            Words and collocations saved from your own writing and practice.
          </p>
        </div>
        {vocabulary.length === 0 ? (
          <Empty className="min-h-[50vh]">
            <EmptyHeader>
              <EmptyTitle>No vocabulary saved</EmptyTitle>
              <EmptyDescription>
                Save useful words or phrases from a correction or natural rewrite in Write.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => router.push("/write")}>Go to Write</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="divide-y rounded-xl border bg-card px-4 shadow-xs">
            {vocabulary.map((item) => (
              <article key={item.id} className="space-y-1.5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-semibold leading-snug">{item.front}</h3>
                  {item.seen_count > 1 && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      saved {item.seen_count}×
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.back}</p>
                {item.example && (
                  <p className="text-sm leading-relaxed text-muted-foreground/80">
                    “{item.example}”
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (mode === "grammar") {
    const drillItem = drill?.items[drill.index];
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
        {header}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">
              {drill ? "Practice this pattern" : "Grammar patterns"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {drill
                ? drill.tag.replaceAll("_", " ")
                : "Your recurring grammar mistakes, ranked by frequency."}
            </p>
          </div>
          {drill && (
            <Button variant="ghost" size="sm" onClick={() => setDrill(null)}>
              Back to patterns
            </Button>
          )}
        </div>
        {drill && !drillItem ? (
          <Empty className="min-h-[45vh]">
            <EmptyHeader>
              <EmptyTitle>Practice complete</EmptyTitle>
              <EmptyDescription>
                {drill.score} of {drill.items.length} correct
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={() => {
                  setDrill({ ...drill, index: 0, score: 0 });
                  setDrillAnswer("");
                  setDrillResult(null);
                }}
              >
                Practice again
              </Button>
            </EmptyContent>
          </Empty>
        ) : drill && drillItem ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (drillResult === null) checkDrillAnswer();
              else nextDrillQuestion();
            }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Fix this sentence — change only the error</span>
              <span className="tabular-nums">
                {drill.index + 1} / {drill.items.length}
              </span>
            </div>
            <div className="space-y-5 rounded-xl border bg-card p-5 shadow-xs">
              <p className="text-lg leading-relaxed">{drillItem.prompt}</p>
              <Input
                autoFocus
                value={drillAnswer}
                onChange={(event) => setDrillAnswer(event.target.value)}
                disabled={drillResult !== null}
                placeholder="Type the corrected sentence…"
                className="h-12 text-base"
              />
              {drillResult !== null && (
                <div className="space-y-2 border-t pt-4 text-sm">
                  <p
                    className={
                      drillResult
                        ? "font-medium text-green-600 dark:text-green-400"
                        : "font-medium text-destructive"
                    }
                  >
                    {drillResult ? "Correct" : "Not quite"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Answer:</span>{" "}
                    <span className="font-medium">{drillItem.answer}</span>
                  </p>
                  <p className="text-muted-foreground">{drillItem.explanation}</p>
                </div>
              )}
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={drillResult === null && !drillAnswer.trim()}
            >
              {drillResult === null
                ? "Check answer"
                : drill.index + 1 === drill.items.length
                  ? "See result"
                  : "Next question"}
            </Button>
          </form>
        ) : patterns.length === 0 ? (
          <Empty className="min-h-[50vh]">
            <EmptyHeader>
              <EmptyTitle>No grammar patterns yet</EmptyTitle>
              <EmptyDescription>
                Check a few workplace messages in Write. Repeated grammar corrections will appear
                here automatically.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => router.push("/write")}>Go to Write</Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-3">
            {patterns.map((pattern) => (
              <article key={pattern.tag} className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-semibold capitalize">
                    {pattern.tag.replaceAll("_", " ")}
                  </h3>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {pattern.count} {pattern.count === 1 ? "time" : "times"}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {pattern.explanation}
                </p>
                <div className="space-y-2 border-t pt-3">
                  {pattern.examples.map((example) => (
                    <p
                      key={`${example.original}-${example.replacement}`}
                      className="text-sm leading-relaxed"
                    >
                      <span className="text-muted-foreground line-through">{example.original}</span>{" "}
                      <span aria-hidden>→</span>{" "}
                      <span className="font-medium">{example.replacement}</span>
                    </p>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startDrill(pattern)}
                  disabled={generatingTag !== null}
                >
                  {generatingTag === pattern.tag ? "Generating…" : "Practice this pattern"}
                </Button>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Due queue finished (or nothing was due).
  if (!current) {
    const pct = reviewed ? Math.round((passed / reviewed) * 100) : 0;
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
        {header}
        <Empty className="min-h-[60vh]">
          <EmptyHeader>
            <EmptyTitle>{reviewed > 0 ? "Session complete" : "Nothing due"}</EmptyTitle>
            <EmptyDescription>
              {reviewed > 0
                ? `${reviewed} reviewed · ${pct}% pass`
                : "Your scheduled cards are done. Browse saved vocabulary or recurring grammar patterns."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setReviewed(0);
                  setPassed(0);
                  load();
                  router.refresh(); // refresh the sidebar due badge
                }}
              >
                {reviewed > 0 ? "Keep going" : "Check again"}
              </Button>
              {vocabulary.length > 0 && (
                <Button variant="outline" onClick={() => switchMode("vocab")}>
                  Browse vocabulary
                </Button>
              )}
              {patterns.length > 0 && (
                <Button variant="outline" onClick={() => switchMode("grammar")}>
                  View grammar
                </Button>
              )}
            </div>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const total = reviewed + queue.length;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
      {/* Header + mode switch + progress */}
      <div className="space-y-3">
        {header}
        <Progress value={total ? (reviewed / total) * 100 : 0} className="h-1" />
      </div>

      {/* Card (flips on reveal) */}
      <div className="min-h-64 [perspective:1000px]">
        <motion.div
          key={`${current.id}-${revealed}`}
          initial={{ rotateX: -80, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          transition={{ duration: 0.28 }}
          className="flex min-h-64 flex-col items-center justify-center rounded-xl border bg-card p-6 text-center shadow-xs"
        >
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {cardLabel}
          </p>
          <p className="whitespace-pre-wrap text-[19px] leading-[1.7]">{question}</p>
          {revealed && (
            <>
              <div className="my-4 h-px w-16 bg-border" />
              <p className="whitespace-pre-wrap text-[17px] leading-[1.7] text-muted-foreground">
                {answer}
              </p>
              {/* The example is the context: what the word looks like in use. */}
              {current.kind === "vocab" && current.example && (
                <p className="mt-3 max-w-prose text-sm italic leading-relaxed text-muted-foreground/80">
                  “{current.example}”
                </p>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* Vocab: type the answer before revealing */}
      {current.kind === "vocab" && !revealed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRevealed(true);
            (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
          }}
          className="flex gap-2"
        >
          {/* key: a fresh box per card, so the previous answer never carries over */}
          <Input
            key={current.id}
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={produce ? "Type the English word or phrase…" : "Gõ nghĩa tiếng Việt…"}
            className="h-12 text-base"
          />
          <Button type="submit" size="lg" className="h-12">
            Check <Kbd className="ml-2">↵</Kbd>
          </Button>
        </form>
      )}
      {current.kind === "vocab" && revealed && (
        <p
          className={`text-center text-sm ${correct ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
        >
          {correct ? "Correct" : typed.trim() ? `You wrote: “${typed.trim()}”` : "No answer"}
        </p>
      )}

      {/* Controls */}
      {!revealed ? (
        current.kind !== "vocab" && (
          <Button size="lg" className="h-14 text-base" onClick={() => setRevealed(true)}>
            Show answer <Kbd className="ml-2">Space</Kbd>
          </Button>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            variant="outline"
            className="h-16 flex-col gap-0.5"
            onClick={() => rate(Rating.Again)}
          >
            <span className="text-base font-semibold text-destructive">Again</span>
            <span className="text-xs text-muted-foreground">1 · {preview?.[Rating.Again]}</span>
          </Button>
          <Button size="lg" className="h-16 flex-col gap-0.5" onClick={() => rate(Rating.Good)}>
            <span className="text-base font-semibold">Good</span>
            <span className="text-xs opacity-70">Space · {preview?.[Rating.Good]}</span>
          </Button>
        </div>
      )}
      {revealed && (
        <p className="text-center text-xs text-muted-foreground">
          also: 2 = Hard ({preview?.[Rating.Hard]}) · 4 = Easy ({preview?.[Rating.Easy]})
        </p>
      )}
    </div>
  );
}
