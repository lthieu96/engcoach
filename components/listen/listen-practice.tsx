"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { VolumeMax as Volume2, Plus, ArrowRight } from "@untitledui/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Kbd } from "@/components/ui/kbd";
import { InlineDiff } from "@/components/writing/inline-diff";
import { getLlm, isLlmConfigured } from "@/lib/providers";
import { createClient } from "@/lib/supabase/client";
import { LlmSetupNotice } from "@/components/llm-setup-notice";
import { scoreDictation, type DictationResult } from "@/lib/dictation";

export function ListenPractice() {
  const [sentences, setSentences] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<DictationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const supabase = useRef(createClient());

  // profiles.settings.auto_task — same switch as Write's auto-generated tasks.
  const fetchAutoTask = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.current.from("profiles").select("settings").single();
    return (data?.settings as { auto_task?: boolean } | null)?.auto_task ?? true;
  }, []);

  const current = sentences[idx];

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }, []);

  const loadBatch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/dictation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ llm: getLlm() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      if (!data.sentences?.length) throw new Error("The model returned no sentences");
      setSentences(data.sentences);
      setIdx(0);
      setTyped("");
      setResult(null);
      setAdded(false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load sentences");
    } finally {
      setLoading(false);
    }
  }, []);

  const wasConfigured = useRef(false);
  useEffect(() => {
    const ok = isLlmConfigured();
    wasConfigured.current = ok;
    setConfigured(ok);
    if (ok) {
      fetchAutoTask().then((auto) => {
        if (auto) loadBatch();
        else setLoading(false);
      });
    } else setLoading(false);
  }, [loadBatch, fetchAutoTask]);

  // Unblock live when the user saves a provider in Settings.
  useEffect(() => {
    function onConfig() {
      const ok = isLlmConfigured();
      setConfigured(ok);
      fetchAutoTask().then((auto) => {
        if (ok && !wasConfigured.current && auto) loadBatch();
        wasConfigured.current = ok;
      });
    }
    window.addEventListener("llm-config-changed", onConfig);
    return () => window.removeEventListener("llm-config-changed", onConfig);
  }, [loadBatch, fetchAutoTask]);

  // Auto-play each new sentence.
  useEffect(() => {
    if (current) speak(current);
  }, [current, speak]);

  function check() {
    if (!typed.trim() || !current) return;
    setResult(scoreDictation(current, typed));
  }

  function next() {
    if (idx + 1 >= sentences.length) {
      loadBatch();
    } else {
      setIdx((i) => i + 1);
      setTyped("");
      setResult(null);
      setAdded(false);
    }
  }

  async function addCard() {
    if (!result || !current) return;
    setAdded(true);
    try {
      const res = await fetch("/api/card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          front: `Listen: ${result.clozeFront}`,
          back: current,
          source: "manual",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Flashcard added");
    } catch {
      setAdded(false);
      toast.error("Couldn't add flashcard");
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      result ? next() : check();
    }
  }

  if (configured === null) return null;
  if (!configured || loadError) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Listen &amp; type</h1>
          <p className="text-sm text-muted-foreground">
            Type exactly what you hear — punctuation and capitals don&apos;t count.
          </p>
        </div>
        {!configured ? (
          <LlmSetupNotice feature="Dictation practice" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <div className="space-y-0.5">
              <p className="font-medium text-destructive">Couldn&apos;t load sentences</p>
              <p className="text-muted-foreground">{loadError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadBatch} disabled={loading}>
              Retry
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (loading && !current) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  // Auto-generate off: wait for the user to ask for a batch.
  if (!current) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Listen &amp; type</h1>
          <p className="text-sm text-muted-foreground">
            Type exactly what you hear — punctuation and capitals don&apos;t count.
          </p>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-xs">
          <span className="flex size-10 items-center justify-center rounded-lg border bg-background shadow-xs">
            <Volume2 className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            Five spoken workplace sentences, generated fresh each round.
          </p>
          <Button onClick={loadBatch}>Load sentences</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 md:p-6">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Listen &amp; type</h1>
          <p className="text-sm text-muted-foreground">
            Type exactly what you hear — punctuation and capitals don&apos;t count.
          </p>
        </div>
        <span className="rounded-full border px-2.5 py-0.5 text-xs tabular-nums text-muted-foreground">
          {idx + 1} / {sentences.length}
        </span>
      </div>
      <Progress value={sentences.length ? (idx / sentences.length) * 100 : 0} className="h-1" />

      {/* Play */}
      <Button variant="outline" size="lg" className="h-14 gap-2.5" onClick={() => speak(current)}>
        <Volume2 className="size-5" /> Play sentence
      </Button>

      {/* Input — composer card, matches the Write page */}
      <div className="rounded-xl border bg-card shadow-xs transition-colors focus-within:border-ring">
        <Textarea
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type what you hear…"
          className="min-h-24 resize-none rounded-none border-0 bg-transparent px-4 py-3 text-[17px] leading-[1.7] shadow-none focus-visible:border-transparent focus-visible:ring-0"
          autoFocus
          disabled={!!result}
        />
        {!result && (
          <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
            <Kbd>⌘↵</Kbd>
            <Button size="sm" onClick={check} disabled={!typed.trim()}>
              Check
            </Button>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-3">
          <Card>
            <CardContent className="py-4">
              <div className="mb-2 text-sm font-medium">
                {result.correct ? (
                  <span className="text-green-600 dark:text-green-400">Perfect</span>
                ) : (
                  <span>
                    {result.total - result.missed}/{result.total} words · green = what you missed
                  </span>
                )}
              </div>
              <InlineDiff original={typed} rewrite={current} />
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button onClick={next} className="flex-1">
              Next <ArrowRight className="size-4" />
            </Button>
            {!result.correct && (
              <Button variant="outline" onClick={addCard} disabled={added}>
                <Plus className="size-4" /> {added ? "Added" : "Flashcard"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
