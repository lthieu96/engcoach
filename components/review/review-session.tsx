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
import { createClient } from "@/lib/supabase/client";
import { fromDb, review, intervals, Rating, type Grade } from "@/lib/fsrs";
import { matches } from "@/lib/vocab";

type Deck = "sentence" | "vocab";
type CardRow = {
  id: string;
  kind: Deck;
  front: string;
  back: string;
  example: string | null;
  fsrs: unknown;
  due: string;
};
const BATCH = 30;
const DECKS: { id: Deck; label: string }[] = [
  { id: "sentence", label: "Sentences" },
  { id: "vocab", label: "Vocabulary" },
];

export function ReviewSession() {
  const supabase = useRef(createClient());
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [deck, setDeck] = useState<Deck>("sentence");
  const [queues, setQueues] = useState<Record<Deck, CardRow[]>>({ sentence: [], vocab: [] });
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [reviewed, setReviewed] = useState(0);
  const [passed, setPassed] = useState(0);

  // Both decks in one pass so the tab counts are real (and switching is instant).
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.current
      .from("cards")
      .select("id, kind, front, back, example, fsrs, due")
      .lte("due", new Date().toISOString())
      .order("due")
      .limit(BATCH * 2);
    const rows = (data as CardRow[]) ?? [];
    setQueues({
      sentence: rows.filter((c) => c.kind !== "vocab").slice(0, BATCH),
      vocab: rows.filter((c) => c.kind === "vocab").slice(0, BATCH),
    });
    setRevealed(false);
    setTyped("");
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.current.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    load();
  }, [load]);

  const queue = queues[deck];
  const current = queue[0];
  const state = current ? fromDb(current.fsrs) : null;
  const preview: Record<Grade, string> | null = state ? intervals(state) : null;

  // Vocab alternates direction: first sight is recognition (EN → VI), every
  // later review is production (VI → EN) — the harder, more useful direction.
  const produce = current?.kind === "vocab" && (state?.reps ?? 0) > 0;
  const question = current?.kind === "vocab" && produce ? current.back : current?.front;
  const answer = current?.kind === "vocab" && produce ? current?.front : current?.back;
  const correct = current?.kind === "vocab" && revealed ? matches(typed, answer ?? "") : null;

  const rate = useCallback(
    (rating: Grade) => {
      const card = queues[deck][0];
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
      setQueues((qs) => {
        const [, ...rest] = qs[deck];
        // Again → relearn this session; its answer hides again on requeue.
        return {
          ...qs,
          [deck]:
            rating === Rating.Again
              ? [...rest, { ...card, fsrs: next, due: due.toISOString() }]
              : rest,
        };
      });
    },
    [queues, deck, userId]
  );

  // Keyboard: Space reveals, then Space=Good, 1=Again, 2=Hard, 3=Good, 4=Easy.
  // While the vocab answer box has focus the keys belong to the box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
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
  }, [current, revealed, rate]);

  function switchDeck(d: Deck) {
    setDeck(d);
    setRevealed(false);
    setTyped("");
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <AsciiSpinner label="Loading deck…" className="text-base text-muted-foreground" />
      </div>
    );
  }

  const tabs = (
    <Tabs value={deck} onValueChange={(v) => switchDeck(v as Deck)}>
      <TabsList>
        {DECKS.map((d) => (
          <TabsTrigger key={d.id} value={d.id}>
            {d.label}
            {queues[d.id].length > 0 && (
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                {queues[d.id].length}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  // Deck finished (or nothing was due in it).
  if (!current) {
    const other = DECKS.find((d) => d.id !== deck)!;
    const pct = reviewed ? Math.round((passed / reviewed) * 100) : 0;
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Review</h1>
          {tabs}
        </div>
        <Empty className="min-h-[60vh]">
          <EmptyHeader>
            <EmptyTitle>{reviewed > 0 ? "Session complete" : "Nothing due"}</EmptyTitle>
            <EmptyDescription>
              {reviewed > 0
                ? `${reviewed} reviewed · ${pct}% pass`
                : deck === "vocab"
                  ? "No vocabulary due. Save words from the rewrite in Write to grow this deck."
                  : "No sentences due. Accept corrections in Write to grow this deck."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
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
              {queues[other.id].length > 0 && (
                <Button variant="outline" onClick={() => switchDeck(other.id)}>
                  {other.label} ({queues[other.id].length})
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
      {/* Header + deck switch + progress */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Review</h1>
          {tabs}
        </div>
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
          {current.kind === "vocab" && (
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {produce ? "Viết bằng tiếng Anh" : "Nghĩa tiếng Việt là gì?"}
            </p>
          )}
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
