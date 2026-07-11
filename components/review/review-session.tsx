"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AsciiSpinner } from "@/components/ascii-spinner";
import { Kbd } from "@/components/ui/kbd";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { createClient } from "@/lib/supabase/client";
import { fromDb, review, intervals, Rating, type Grade } from "@/lib/fsrs";

type CardRow = { id: string; front: string; back: string; fsrs: unknown; due: string };
const BATCH = 30;

export function ReviewSession() {
  const supabase = useRef(createClient());
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [passed, setPassed] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.current
      .from("cards")
      .select("id, front, back, fsrs, due")
      .lte("due", new Date().toISOString())
      .order("due")
      .limit(BATCH);
    setQueue((data as CardRow[]) ?? []);
    setRevealed(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.current.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    load();
  }, [load]);

  const current = queue[0];
  // Interval previews (only meaningful once we have a card).
  const preview: Record<Grade, string> | null = current
    ? intervals(fromDb(current.fsrs))
    : null;

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
      setQueue((q) => {
        const [, ...rest] = q;
        // Again → relearn this session; its answer hides again on requeue.
        return rating === Rating.Again ? [...rest, { ...card, fsrs: next, due: due.toISOString() }] : rest;
      });
    },
    [queue, userId]
  );

  // Keyboard: Space reveals, then Space=Good, 1=Again, 2=Hard, 3=Good, 4=Easy.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
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

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <AsciiSpinner label="Loading deck…" className="text-base text-muted-foreground" />
      </div>
    );
  }

  // Session complete (or nothing was due).
  if (!current) {
    const pct = reviewed ? Math.round((passed / reviewed) * 100) : 0;
    return (
      <Empty className="min-h-[70vh]">
        <EmptyHeader>
          <EmptyTitle>{reviewed > 0 ? "Session complete" : "Nothing due"}</EmptyTitle>
          <EmptyDescription>
            {reviewed > 0
              ? `${reviewed} reviewed · ${pct}% pass`
              : "No cards to review right now. Accept corrections in Write to grow your deck."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
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
        </EmptyContent>
      </Empty>
    );
  }

  const total = reviewed + queue.length;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
      {/* Header + progress */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Review</h1>
          <span className="rounded-full border px-2.5 py-0.5 text-xs tabular-nums text-muted-foreground">
            {queue.length} left
          </span>
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
          <p className="whitespace-pre-wrap text-[19px] leading-[1.7]">{current.front}</p>
          {revealed && (
            <>
              <div className="my-4 h-px w-16 bg-border" />
              <p className="whitespace-pre-wrap text-[17px] leading-[1.7] text-muted-foreground">
                {current.back}
              </p>
            </>
          )}
        </motion.div>
      </div>

      {/* Controls */}
      {!revealed ? (
        <Button size="lg" className="h-14 text-base" onClick={() => setRevealed(true)}>
          Show answer <Kbd className="ml-2">Space</Kbd>
        </Button>
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
