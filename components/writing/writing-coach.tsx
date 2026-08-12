"use client";

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw01 as RefreshCw, Send01 as Send } from "@untitledui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Kbd } from "@/components/ui/kbd";
import { createClient } from "@/lib/supabase/client";
import { isLlmConfigured } from "@/lib/providers";
import { postLlm } from "@/lib/api";
import { LlmSetupNotice } from "@/components/llm-setup-notice";
import { AsciiSpinner } from "@/components/ascii-spinner";
import { CHANNELS, type Channel, type Category } from "@/lib/taxonomy";
import { AnnotatedView } from "./annotated-view";
import { InlineDiff } from "./inline-diff";
import { CorrectionCard } from "./correction-card";
import { toUICorrection, type SavedCorrection, type UICorrection } from "./types";

type Mode = "compose" | "translate" | "paste";
type TranslateKind = "workplace" | "interview";
type Vocab = { term: string; meaning_vi: string; example: string };
type Result = {
  documentId: string | null;
  corrections: SavedCorrection[];
  natural_rewrite: string;
  overall_comment: string;
  vocabulary?: Vocab[];
  meaning_score?: number;
  alternatives?: string[];
};
type Task = { scenario?: string; goal?: string; constraints?: string[]; channel?: Channel; vietnamese?: string; context?: string };

const FILTERS: (Category | "all")[] = ["all", "grammar", "clarity", "tone"];
const BACKEND_TOPIC_SUGGESTIONS = [
  { label: "Event loop", value: "Node.js event loop" },
  { label: "Streams", value: "Streams & backpressure" },
  { label: "NestJS DI", value: "NestJS dependency injection" },
  { label: "REST API", value: "REST API design" },
  { label: "PostgreSQL", value: "PostgreSQL indexing" },
  { label: "Redis", value: "Redis caching" },
  { label: "Queues", value: "Message queues & idempotency" },
  { label: "Scaling Node.js", value: "Scaling Node.js services" },
];

export function WritingCoach() {
  const [mode, setMode] = useState<Mode>("translate");
  const [translateKind, setTranslateKind] = useState<TranslateKind>("workplace");
  const [interviewTopic, setInterviewTopic] = useState("");
  const [channel, setChannel] = useState<Channel>("slack");
  const [task, setTask] = useState<Task | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [corrections, setCorrections] = useState<UICorrection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [view, setView] = useState<"annotated" | "rewrite">("annotated");
  const [checking, setChecking] = useState(false);
  const [loadingTask, setLoadingTask] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  // Vocabulary: AI suggestions saved so far, plus whatever the user highlights.
  const [savedTerms, setSavedTerms] = useState<string[]>([]);
  const [savingTerm, setSavingTerm] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  // null = not yet known (first client render) — avoids a hydration mismatch.
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  // Round-1 corrections while a from-memory rewrite is in progress (Spec:
  // feedback uptake — applying corrections is where the learning happens).
  const [baseline, setBaseline] = useState<UICorrection[] | null>(null);

  const supabase = useRef(createClient());
  const checkedText = useRef(""); // text as it was when Check ran (anchors are relative to this)
  const wasConfigured = useRef(false);
  const [autoTask, setAutoTask] = useState(true);

  // profiles.settings.auto_task — whether tasks generate without being asked.
  const fetchAutoTask = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.current.from("profiles").select("settings").single();
    const auto = (data?.settings as { auto_task?: boolean } | null)?.auto_task ?? true;
    setAutoTask(auto);
    return auto;
  }, []);

  const newTask = useCallback(async (m: Mode, kind?: TranslateKind, topic?: string) => {
    if (m === "paste") {
      setTask(null);
      return;
    }
    setLoadingTask(true);
    setTaskError(null);
    try {
      setTask(
        await postLlm<Task>("/api/task", {
          mode: m,
          translateKind: kind,
          topic: kind === "interview" ? topic?.trim() : undefined,
        })
      );
    } catch (e) {
      setTaskError(e instanceof Error ? e.message : "Couldn't generate a task.");
    } finally {
      setLoadingTask(false);
    }
  }, []);

  function changeTranslateKind(kind: TranslateKind) {
    setTranslateKind(kind);
    setTask(null);
    setText("");
    setResult(null);
    setCorrections([]);
    setBaseline(null);
  }

  function switchMode(m: Mode) {
    setMode(m);
    setResult(null);
    setCorrections([]);
    setBaseline(null);
    setText("");
    if (m === "compose" && autoTask) newTask(m);
    else if (m === "translate" && autoTask && translateKind === "workplace")
      newTask(m, translateKind);
    else setTask(null);
  }

  async function check() {
    if (!text.trim() || checking) return;
    setChecking(true);
    setResult(null);
    setCorrections([]);
    setCheckError(null);
    try {
      const data = await postLlm<Result>("/api/correct", {
        text,
        channel: task?.channel ?? channel,
        mode,
        vietnamese: task?.vietnamese,
        title: task?.scenario ?? task?.context ?? null,
      });
      checkedText.current = text;
      setSelection("");
      setResult(data);
      setCorrections(data.corrections.map(toUICorrection));
      setView("annotated");
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setChecking(false);
    }
  }

  function setStatus(id: string, status: UICorrection["status"]) {
    setCorrections((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    // .then() fires the lazy PostgREST builder; report failures instead of losing them.
    supabase.current
      .from("corrections")
      .update({ status })
      .eq("id", id)
      .then(({ error }) => {
        if (error) toast.error(`Couldn't save: ${error.message}`);
      });
  }

  async function addCard(id: string) {
    setAddingId(id);
    try {
      const data = await postLlm<{ deduped?: boolean }>("/api/card", { correctionId: id });
      toast.success(data.deduped ? "Already had a card for this" : "Flashcard added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the flashcard");
    } finally {
      setAddingId(null);
    }
  }

  // Save a word/phrase to the vocabulary deck. `meaning` comes from an AI
  // suggestion; a highlighted term arrives bare and the server fills it in.
  async function saveVocab(term: string, meaning?: string, example?: string) {
    setSavingTerm(term);
    try {
      const data = await postLlm<{ deduped?: boolean }>("/api/card", {
        kind: "vocab",
        term,
        meaning,
        example,
        context: checkedText.current.slice(0, 400),
      });
      setSavedTerms((t) => [...t, term]);
      toast.success(data.deduped ? `Already in your deck: “${term}”` : `Saved “${term}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the word");
    } finally {
      setSavingTerm(null);
    }
  }

  // Round 2: hide the annotated draft and rewrite from memory.
  function startRewrite() {
    setBaseline(corrections.filter((c) => c.status !== "dismissed"));
    setResult(null);
    setCorrections([]);
    setText("");
    setCheckError(null);
  }

  function cancelRewrite() {
    setBaseline(null);
    setText(checkedText.current); // back to the checked draft, re-Check to see it again
  }

  // Rewrite verdict: which round-1 rule tags were fixed / survived / appeared.
  const rewriteCmp = useMemo(() => {
    if (!baseline || !result) return null;
    const prev = new Set(baseline.map((c) => c.rule_tag));
    const now = new Set(
      corrections.filter((c) => c.status !== "dismissed").map((c) => c.rule_tag)
    );
    return {
      fixed: [...prev].filter((t) => !now.has(t)),
      remaining: [...prev].filter((t) => now.has(t)),
      added: [...now].filter((t) => !prev.has(t)),
    };
  }, [baseline, result, corrections]);

  const activate = useCallback((id: string) => {
    setActiveId(id);
    document.getElementById(`card-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    document.getElementById(`span-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  // On mount: honor the /write?text=... deep link (Raycast/Shortcut → Paste mode),
  // otherwise generate the first task — but only once a provider is configured.
  useEffect(() => {
    const ok = isLlmConfigured();
    wasConfigured.current = ok;
    setConfigured(ok);
    const t = new URLSearchParams(location.search).get("text");
    if (t) {
      setMode("paste");
      setText(t);
    } else if (ok) {
      fetchAutoTask().then((auto) => {
        if (auto) newTask("translate");
      });
    }
  }, [newTask, fetchAutoTask]);

  // Settings saved: refresh auto-task preference and unblock if just configured.
  useEffect(() => {
    function onConfig() {
      const ok = isLlmConfigured();
      setConfigured(ok);
      fetchAutoTask().then((auto) => {
        if (ok && !wasConfigured.current && mode !== "paste" && auto) newTask(mode);
        wasConfigured.current = ok;
      });
    }
    window.addEventListener("llm-config-changed", onConfig);
    return () => window.removeEventListener("llm-config-changed", onConfig);
  }, [newTask, mode, fetchAutoTask]);

  const visible = useMemo(
    () => corrections.filter((c) => filter === "all" || c.category === filter),
    [corrections, filter]
  );
  const shown = useMemo(() => visible.filter((c) => c.status !== "dismissed"), [visible]);
  const isInterviewPractice = mode === "translate" && translateKind === "interview";
  const showTaskContent = !isInterviewPractice || Boolean(loadingTask || taskError || task);
  const showInterviewEmptyState =
    isInterviewPractice && !task && !loadingTask && !taskError;
  const showEditor = !isInterviewPractice || Boolean(task);
  let editorPlaceholder = "Write here…";
  if (baseline && !result) editorPlaceholder = "Rewrite your message from memory…";
  else if (isInterviewPractice && !task)
    editorPlaceholder = "Generate an interview prompt first…";
  else if (mode === "translate") editorPlaceholder = "Write your English version…";
  else if (mode === "paste")
    editorPlaceholder = "Paste your draft here… (or open /write?text=… from Raycast)";

  // Keyboard: ⌘/Ctrl+Enter = Check (works while typing); ↑/↓ move active,
  // Enter accept, Esc dismiss — only when focus is OUTSIDE the editor.
  // Latest state flows through refs so the listener registers exactly once.
  const keyCtx = useRef({ shown, activeId, check, setStatus });
  keyCtx.current = { shown, activeId, check, setStatus };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctx = keyCtx.current;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        ctx.check();
        return;
      }
      // Never steal caret/typing keys from the editor.
      if (document.activeElement?.tagName === "TEXTAREA") return;
      if (!ctx.shown.length) return;
      const idx = ctx.shown.findIndex((c) => c.id === ctx.activeId);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next =
          e.key === "ArrowDown" ? Math.min(idx + 1, ctx.shown.length - 1) : Math.max(idx - 1, 0);
        activate(ctx.shown[next < 0 ? 0 : next].id);
      } else if (ctx.activeId && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        ctx.setStatus(ctx.activeId, e.key === "Enter" ? "accepted" : "dismissed");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activate]);

  if (configured === null) return null;
  if (!configured) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Write</h1>
          <p className="text-sm text-muted-foreground">
            Draft it, get corrections, turn mistakes into flashcards.
          </p>
        </div>
        <LlmSetupNotice feature="Writing practice" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6">
      {/* Header: title left, mode switch right */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Write</h1>
          <p className="text-sm text-muted-foreground">
            Draft it, get corrections, turn mistakes into flashcards.
          </p>
        </div>
        <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="compose">Compose</TabsTrigger>
            <TabsTrigger value="translate">Translate</TabsTrigger>
            <TabsTrigger value="paste">Paste</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Task card */}
      {mode !== "paste" && (
        <Card size="sm" className="gap-0 py-0">
          {mode === "translate" && (
            <CardContent className="space-y-3.5 py-4">
              <div
                className={`grid gap-3 ${
                  isInterviewPractice ? "md:grid-cols-[12rem_minmax(0,1fr)]" : ""
                }`}
              >
                <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
                  <span>Practice type</span>
                  <NativeSelect
                    value={translateKind}
                    onChange={(e) => changeTranslateKind(e.target.value as TranslateKind)}
                    className="block w-full"
                  >
                    <NativeSelectOption value="workplace">Workplace message</NativeSelectOption>
                    <NativeSelectOption value="interview">Interview answer</NativeSelectOption>
                  </NativeSelect>
                </label>
                {isInterviewPractice && (
                  <div className="min-w-0 space-y-1.5">
                    <label
                      htmlFor="interview-topic"
                      className="block text-xs font-medium text-foreground"
                    >
                      Interview topic
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="interview-topic"
                        value={interviewTopic}
                        onChange={(e) => setInterviewTopic(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && interviewTopic.trim() && !loadingTask) {
                            newTask(mode, translateKind, interviewTopic);
                          }
                        }}
                        placeholder="e.g. Node.js event loop"
                        aria-describedby="interview-topic-help"
                        maxLength={120}
                      />
                      <Button
                        className="w-full sm:w-auto"
                        onClick={() => newTask(mode, translateKind, interviewTopic)}
                        disabled={loadingTask || !interviewTopic.trim()}
                      >
                        <RefreshCw className={`size-3.5 ${loadingTask ? "animate-spin" : ""}`} />
                        {loadingTask ? "Generating…" : taskError ? "Try again" : "Generate prompt"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {isInterviewPractice && (
                <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
                  <span id="interview-topic-help" className="mr-1 text-xs text-muted-foreground">
                    Popular topics
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {BACKEND_TOPIC_SUGGESTIONS.map((topic) => (
                      <button
                        key={topic.value}
                        type="button"
                        onClick={() => setInterviewTopic(topic.value)}
                        aria-pressed={interviewTopic === topic.value}
                        className="h-7 whitespace-nowrap rounded-md border bg-background px-2.5 text-xs text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px aria-pressed:border-foreground/20 aria-pressed:bg-muted aria-pressed:text-foreground"
                      >
                        {topic.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
          {showTaskContent && (
            <CardContent
              className={`flex items-start justify-between gap-4 py-4 ${
                mode === "translate" ? "border-t bg-muted/20" : ""
              }`}
            >
              <div className="min-w-0 text-sm">
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {isInterviewPractice
                    ? "Translate the answer"
                    : mode === "translate"
                      ? "Translate this"
                      : "Your task"}
                </div>
                {loadingTask ? (
                  <div className="flex h-10 items-center">
                    <AsciiSpinner label="Generating task…" className="text-muted-foreground" />
                  </div>
                ) : taskError ? (
                  <div className="space-y-1">
                    <p className="font-medium text-destructive">Couldn&apos;t generate a task</p>
                    <p className="text-muted-foreground">{taskError}</p>
                  </div>
                ) : task ? (
                  <div className="space-y-2">
                    {mode === "translate" ? (
                      <>
                        {task.channel === "interview" && task.context && (
                          <p className="text-muted-foreground">
                            <span className="font-medium text-foreground">Question:</span>{" "}
                            {task.context}
                          </p>
                        )}
                        <p className="text-base font-medium leading-relaxed">{task.vietnamese}</p>
                      </>
                    ) : (
                      <p className="text-base leading-relaxed">{task.scenario}</p>
                    )}
                    {task.goal && <p className="text-muted-foreground">Goal: {task.goal}</p>}
                    {task.context && task.channel !== "interview" && (
                      <p className="text-muted-foreground">{task.context}</p>
                    )}
                    {!!task.constraints?.length && (
                      <div className="flex flex-wrap gap-1.5">
                        {task.constraints.map((c, i) => (
                          <span
                            key={i}
                            className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">A new task will appear here.</p>
                )}
              </div>
              {!isInterviewPractice && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => newTask(mode, translateKind, interviewTopic)}
                  disabled={loadingTask}
                >
                  <RefreshCw className={`size-3.5 ${loadingTask ? "animate-spin" : ""}`} />{" "}
                  {taskError ? "Retry" : "New task"}
                </Button>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Rewrite round in progress */}
      {baseline && !result && !checking && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          <p>
            <span className="font-medium">Round 2 — rewrite from memory.</span>{" "}
            <span className="text-muted-foreground">
              Apply the corrections without looking at your old draft.
            </span>
          </p>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={cancelRewrite}>
            Cancel
          </Button>
        </div>
      )}

      {showInterviewEmptyState && (
        <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
          <p className="text-sm font-medium">Generate a prompt to start</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a backend topic above or enter your own.
          </p>
        </div>
      )}

      {showEditor && (
        /* Editor — composer card: borderless textarea + action footer */
        <div className="rounded-xl border bg-card shadow-xs transition-colors focus-within:border-ring">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={editorPlaceholder}
            className="min-h-48 resize-none rounded-none border-0 bg-transparent px-4 py-3 text-[17px] leading-[1.7] shadow-none focus-visible:border-transparent focus-visible:ring-0"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
            <div className="flex items-center gap-3">
              {isInterviewPractice ? (
                <span className="text-xs font-medium text-muted-foreground">Interview answer</span>
              ) : (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Channel
                  <NativeSelect
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as Channel)}
                    size="sm"
                  >
                    {CHANNELS.map((c) => (
                      <NativeSelectOption key={c} value={c}>
                        {c}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
              )}
              <span className="text-xs tabular-nums text-muted-foreground">
                {text.trim() ? text.trim().split(/\s+/).length : 0} words
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Kbd>⌘↵</Kbd>
              <Button size="sm" onClick={check} disabled={checking || !text.trim()}>
                <Send className="size-3.5" /> {checking ? "Checking…" : "Check"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Check failed — inline, with the real reason and a retry */}
      {checkError && !checking && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div className="space-y-0.5">
            <p className="font-medium text-destructive">Check failed</p>
            <p className="text-muted-foreground">{checkError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={check}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </div>
      )}

      {/* Results */}
      {checking && (
        <div className="space-y-3">
          <AsciiSpinner label="Analyzing your writing…" className="text-muted-foreground" />
          <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
            <Skeleton className="h-64 w-full" />
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      )}
      {result && (
        <div className="space-y-3">
          {/* Round-2 verdict: what happened to the round-1 issues */}
          {rewriteCmp && (
            <div className="space-y-1.5 rounded-xl border bg-card p-4 text-sm shadow-xs">
              <p className="font-medium">Rewrite check</p>
              {rewriteCmp.fixed.length > 0 && (
                <p>
                  <span className="font-medium text-green-600 dark:text-green-400">Fixed:</span>{" "}
                  {rewriteCmp.fixed.join(", ")}
                </p>
              )}
              {rewriteCmp.remaining.length > 0 && (
                <p>
                  <span className="font-medium text-destructive">Still there:</span>{" "}
                  {rewriteCmp.remaining.join(", ")}
                </p>
              )}
              {rewriteCmp.added.length > 0 && (
                <p>
                  <span className="font-medium text-muted-foreground">New:</span>{" "}
                  {rewriteCmp.added.join(", ")}
                </p>
              )}
              {rewriteCmp.remaining.length === 0 && rewriteCmp.added.length === 0 && (
                <p className="text-muted-foreground">All earlier issues cleared — clean rewrite.</p>
              )}
            </div>
          )}

          {/* Verdict row: error counts by category + translate score */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["grammar", "clarity", "tone"] as const).map((cat) => {
              const n = corrections.filter(
                (c) => c.category === cat && c.status !== "dismissed"
              ).length;
              return (
                <span
                  key={cat}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 capitalize ${
                    n === 0 ? "text-muted-foreground/60" : "font-medium"
                  }`}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: `var(--cat-${cat})`, opacity: n === 0 ? 0.35 : 1 }}
                  />
                  {n} {cat}
                </span>
              );
            })}
            {mode === "translate" && result.meaning_score != null && (
              <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium">
                Meaning {result.meaning_score}/5
              </span>
            )}
            {corrections.length === 0 && <span className="text-muted-foreground">Clean draft</span>}
          </div>

          {result.overall_comment && (
            <p className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">
              {result.overall_comment}
            </p>
          )}
          {mode === "translate" && !!result.alternatives?.length && (
            <p className="text-sm text-muted-foreground">
              Natural alternatives: {result.alternatives.join(" · ")}
            </p>
          )}

          {/* Vocabulary worth keeping — you choose what enters the deck */}
          {!!result.vocabulary?.length && (
            <div className="space-y-2.5 rounded-xl border bg-card p-4 shadow-xs">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Worth learning
              </p>
              {result.vocabulary.map((v) => {
                const saved = savedTerms.includes(v.term);
                return (
                  <div key={v.term} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p>
                        <span className="font-medium">{v.term}</span>
                        <span className="text-muted-foreground"> — {v.meaning_vi}</span>
                      </p>
                      {v.example && (
                        <p className="text-xs italic text-muted-foreground/80">“{v.example}”</p>
                      )}
                    </div>
                    <Button
                      variant={saved ? "ghost" : "outline"}
                      size="sm"
                      className="shrink-0"
                      disabled={saved || savingTerm === v.term}
                      onClick={() => saveVocab(v.term, v.meaning_vi, v.example)}
                    >
                      {saved ? "Saved" : savingTerm === v.term ? "Saving…" : "Save"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Round 2 CTA — applying the feedback is where the learning happens */}
          {corrections.some((c) => c.status !== "dismissed") && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Lock it in:</span> rewrite the
                message from memory, applying the corrections.
              </p>
              <Button variant="outline" size="sm" onClick={startRewrite}>
                <RefreshCw className="size-3.5" /> {baseline ? "Rewrite again" : "Rewrite from memory"}
              </Button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
            {/* Left: annotated / rewrite */}
            <div className="space-y-2">
              <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
                <TabsList>
                  <TabsTrigger value="annotated">Annotated</TabsTrigger>
                  <TabsTrigger value="rewrite">Natural rewrite</TabsTrigger>
                </TabsList>
              </Tabs>
              {/* Highlight anything here to bank it — no popover, just a bar. */}
              <Card
                onMouseUp={() => setSelection(window.getSelection()?.toString().trim() ?? "")}
              >
                <CardContent className="py-4">
                  {view === "annotated" ? (
                    <AnnotatedView
                      text={checkedText.current}
                      corrections={corrections}
                      activeId={activeId}
                      onActivate={activate}
                    />
                  ) : (
                    <InlineDiff original={checkedText.current} rewrite={result.natural_rewrite} />
                  )}
                </CardContent>
              </Card>
              {selection && selection.length <= 60 && (
                <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground">Save </span>
                    <span className="font-medium">“{selection}”</span>
                    <span className="text-muted-foreground"> to vocabulary</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={savingTerm === selection || savedTerms.includes(selection)}
                    onClick={() => saveVocab(selection)}
                  >
                    {savedTerms.includes(selection)
                      ? "Saved"
                      : savingTerm === selection
                        ? "Saving…"
                        : "Save"}
                  </Button>
                </div>
              )}
            </div>

            {/* Right: correction cards */}
            <div className="space-y-2">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <TabsList className="w-full">
                  {FILTERS.map((f) => (
                    <TabsTrigger key={f} value={f} className="flex-1 capitalize">
                      {f}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="space-y-2">
                {/* popLayout: the leaving card fades in place while the rest
                    slide up via layout animation — no height-collapse jank. */}
                <AnimatePresence initial={false} mode="popLayout">
                  {shown.map((c) => (
                    <motion.div
                      key={c.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    >
                      <CorrectionCard
                        c={c}
                        active={activeId === c.id}
                        onActivate={() => activate(c.id)}
                        onAccept={() => setStatus(c.id, "accepted")}
                        onDismiss={() => setStatus(c.id, "dismissed")}
                        onAddCard={() => addCard(c.id)}
                        addingCard={addingId === c.id}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {shown.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No corrections here.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
