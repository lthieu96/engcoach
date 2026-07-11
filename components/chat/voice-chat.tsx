"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Microphone01 as Mic,
  Square,
  Eye,
  EyeOff,
  Plus,
  AlertTriangle as TriangleAlert,
  Users01 as Users,
  AlertCircle as Bug,
  GitPullRequest,
  Briefcase01 as Briefcase,
  ArrowRight,
} from "@untitledui/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { AsciiSpinner } from "@/components/ascii-spinner";
import { speakText, cancelSpeech } from "@/lib/tts";
import { Message, MessageContent } from "@/components/ui/message";
import { SCENARIOS, type Scenario } from "@/lib/scenarios";
import { getLlm, isLlmConfigured } from "@/lib/providers";
import { LlmSetupNotice } from "@/components/llm-setup-notice";
import type { SessionReport } from "@/lib/schemas";

type Msg = { role: "user" | "assistant"; content: string };
type Phase = "idle" | "listening" | "thinking" | "speaking";

// Hidden opener so history starts with a user turn (Gemini rejects a leading
// assistant message). Filtered out of the transcript and the report.
const SEED = "(I've joined the call. Please start.)";

const SCENARIO_ICONS: Record<string, typeof Users> = {
  standup: Users,
  explain_bug: Bug,
  code_review: GitPullRequest,
  interview: Briefcase,
};

export function VoiceChat() {
  const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } =
    useSpeechRecognition();

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [streaming, setStreaming] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [addedCards, setAddedCards] = useState<Set<string>>(new Set());

  const transcriptRef = useRef("");
  transcriptRef.current = transcript;
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;
  const scenarioRef = useRef<Scenario | null>(null);
  scenarioRef.current = scenario;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the transcript pinned to the newest message while streaming/talking.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, transcript]);

  // ---- TTS: queue chunks as sentences arrive; idle when the last one ends.
  const pendingTts = useRef(0);
  const speakChunk = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    pendingTts.current++;
    setPhase("speaking");
    void speakText(t, {
      onend: () => {
        pendingTts.current = Math.max(0, pendingTts.current - 1);
        if (pendingTts.current === 0) setPhase((p) => (p === "speaking" ? "idle" : p));
      },
    });
  }, []);

  // Send one turn and stream the reply: text renders as it arrives and each
  // completed sentence is handed to TTS immediately (no wait for the full reply).
  const streamTurn = useCallback(
    async (next: Msg[]) => {
      const s = scenarioRef.current;
      if (!s) return;
      setMessages(next);
      setPhase("thinking");
      setStreaming(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next, role: s.role, scenario: s.scenario, llm: getLlm() }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Chat failed");
        }
        setMessages((m) => [...m, { role: "assistant", content: "" }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        let spoken = 0; // chars already queued to TTS
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          const snapshot = full;
          setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: snapshot }]);
          // Flush complete sentences (., !, ?, or newline) to the TTS queue —
          // but only decent-sized ones, so "Hi." or "e.g." don't become their
          // own choppy utterances (the final flush below picks up the rest).
          const unspoken = full.slice(spoken);
          const cut = unspoken.search(/[^.!?\n]*$/);
          if (cut >= 20) {
            speakChunk(unspoken.slice(0, cut));
            spoken += cut;
          }
        }
        if (!full.trim()) throw new Error("The model returned an empty reply");
        speakChunk(full.slice(spoken));
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: full }]);
      } catch (e) {
        // Drop the empty/partial assistant bubble on failure.
        setMessages((m) => (m.at(-1)?.role === "assistant" && !m.at(-1)?.content ? m.slice(0, -1) : m));
        setPhase("idle");
        toast.error(e instanceof Error ? e.message : "Chat failed");
        // Opening turn failed → nothing to show; return to the scenario picker.
        if (next.length === 1 && next[0].content === SEED) setScenario(null);
      } finally {
        setStreaming(false);
        // Nothing queued to speak (e.g. TTS unsupported) → back to idle.
        if (pendingTts.current === 0) setPhase((p) => (p === "thinking" ? "idle" : p));
      }
    },
    [speakChunk]
  );

  const sendTurn = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      resetTranscript();
      await streamTurn([...messagesRef.current, { role: "user", content: text.trim() }]);
    },
    [resetTranscript, streamTurn]
  );

  const toggleMic = useCallback(() => {
    if (listening) {
      SpeechRecognition.stopListening();
      // Give the recognizer a beat to flush the final transcript.
      setTimeout(() => sendTurn(transcriptRef.current), 250);
    } else {
      cancelSpeech(); // barge-in: stop TTS when the user speaks
      pendingTts.current = 0;
      resetTranscript();
      setPhase("listening");
      SpeechRecognition.startListening({ continuous: true, language: "en-US" });
    }
  }, [listening, sendTurn, resetTranscript]);

  // Space = push-to-talk toggle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" && scenarioRef.current && !report) {
        e.preventDefault();
        toggleMic();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMic, report]);

  async function start(s: Scenario) {
    const seeded: Msg[] = [{ role: "user", content: SEED }];
    setScenario(s);
    setReport(null);
    scenarioRef.current = s;
    // Partner opens the conversation.
    await streamTurn(seeded);
  }

  async function endSession() {
    cancelSpeech();
    pendingTts.current = 0;
    if (listening) SpeechRecognition.stopListening();
    if (messages.filter((m) => m.content !== SEED).length === 0) {
      setScenario(null);
      return;
    }
    setPhase("thinking");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: messages.filter((m) => m.content !== SEED),
          scenario: scenario?.scenario,
          llm: getLlm(),
        }),
      });
      if (!res.ok) throw new Error();
      setReport(await res.json());
    } catch {
      toast.error("Couldn't build the report");
    } finally {
      setPhase("idle");
    }
  }

  async function addCard(key: string, front: string, back: string) {
    setAddedCards((s) => new Set(s).add(key));
    try {
      const res = await fetch("/api/card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ front, back, source: "chat" }),
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

  // ---- Render ----

  // Web Speech support and localStorage are only knowable in the browser; render
  // nothing on the server so SSR and the first client paint agree.
  const [mounted, setMounted] = useState(false);
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    setMounted(true);
    setConfigured(isLlmConfigured());
    const onConfig = () => setConfigured(isLlmConfigured());
    window.addEventListener("llm-config-changed", onConfig);
    return () => window.removeEventListener("llm-config-changed", onConfig);
  }, []);
  if (!mounted) return null;

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>Voice not supported</AlertTitle>
          <AlertDescription>
            Voice chat uses the Web Speech API — please open this in Chrome or Edge.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Scenario picker
  if (!scenario) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6 md:pt-16">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Practice speaking</h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Pick a scenario and talk it through. Push-to-talk with the mic (or{" "}
            <Kbd>Space</Kbd>). Corrections arrive in a report at the end — no interruptions.
          </p>
        </div>
        {!configured && <LlmSetupNotice feature="Speaking practice" />}
        <div className="grid w-full gap-3 sm:grid-cols-2">
          {SCENARIOS.map((s) => {
            const Icon = SCENARIO_ICONS[s.id] ?? Users;
            return (
              <button
                key={s.id}
                onClick={() => start(s)}
                disabled={!configured}
                className="group flex flex-col gap-3 rounded-xl border bg-card p-5 text-left shadow-xs transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="flex size-9 items-center justify-center rounded-lg border bg-background shadow-xs">
                  <Icon className="size-4.5" />
                </span>
                <span className="flex items-center justify-between font-medium">
                  {s.label}
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Report
  if (report) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Session report</h1>
          <Button variant="outline" size="sm" onClick={() => setScenario(null)}>
            New session
          </Button>
        </div>
        <p className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">{report.fluency_note}</p>

        {report.corrections.length > 0 && (
          <ReportSection title="Corrections">
            {report.corrections.map((c, i) => (
              <ReportItem
                key={`c${i}`}
                added={addedCards.has(`c${i}`)}
                onAdd={() =>
                  addCard(
                    `c${i}`,
                    `Fix: "${c.original}" (${c.rule_tag})`,
                    `${c.replacement}\n${c.explanation}`
                  )
                }
              >
                <span className="text-muted-foreground line-through">{c.original}</span>{" "}
                <span className="font-semibold">{c.replacement}</span>
                <p className="mt-0.5 text-muted-foreground">{c.explanation}</p>
              </ReportItem>
            ))}
          </ReportSection>
        )}

        {report.better_phrasings.length > 0 && (
          <ReportSection title="Say it better">
            {report.better_phrasings.map((p, i) => (
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
          </ReportSection>
        )}

        {report.new_vocabulary.length > 0 && (
          <ReportSection title="New vocabulary">
            {report.new_vocabulary.map((v, i) => (
              <ReportItem
                key={`v${i}`}
                added={addedCards.has(`v${i}`)}
                onAdd={() => addCard(`v${i}`, `${v.term}?`, `${v.meaning}\ne.g. ${v.example}`)}
              >
                <span className="font-semibold">{v.term}</span> — {v.meaning}
                <p className="mt-0.5 text-muted-foreground">e.g. {v.example}</p>
              </ReportItem>
            ))}
          </ReportSection>
        )}
      </div>
    );
  }

  // Live conversation
  const visible = messages.filter((m) => m.content !== SEED);
  const lastIdx = visible.length - 1;
  return (
    <div className="mx-auto flex h-[calc(100dvh-3rem)] max-w-2xl flex-col gap-3 p-4 md:h-dvh md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span className="text-sm font-medium">{scenario.label}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowTranscript((v) => !v)}>
            {showTranscript ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            <span className="hidden sm:inline">{showTranscript ? "Hide" : "Show"} transcript</span>
          </Button>
          <Button variant="outline" size="sm" onClick={endSession}>
            End session
          </Button>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-xl border bg-card p-4 shadow-xs">
        {visible.length === 0 && phase === "thinking" && (
          <AsciiSpinner label="Connecting…" className="text-muted-foreground" />
        )}
        {showTranscript ? (
          visible.map((m, i) => (
            <Message key={i} align={m.role === "user" ? "end" : "start"}>
              <MessageContent>
                <Bubble
                  variant={m.role === "user" ? "default" : "muted"}
                  align={m.role === "user" ? "end" : "start"}
                >
                  <BubbleContent className="whitespace-pre-wrap text-[15px] leading-relaxed">
                    {m.content}
                    {/* Streaming caret on the reply being generated */}
                    {streaming && m.role === "assistant" && i === lastIdx && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
                    )}
                  </BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          ))
        ) : (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            Transcript hidden — listen and reply.
          </p>
        )}
        {listening && transcript && (
          <Message align="end">
            <MessageContent>
              <Bubble variant="tinted" align="end">
                <BubbleContent className="text-[15px] italic">{transcript}…</BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        )}
      </div>

      {/* Mic control */}
      <div className="flex flex-col items-center gap-2 pt-1">
        <div className="relative">
          {/* Pulse ring while active */}
          {phase !== "idle" && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  phase === "listening"
                    ? "color-mix(in oklab, var(--destructive) 35%, transparent)"
                    : "color-mix(in oklab, var(--primary) 35%, transparent)",
              }}
              animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeOut" }}
            />
          )}
          <Button
            size="lg"
            onClick={toggleMic}
            disabled={phase === "thinking"}
            variant={listening ? "destructive" : "default"}
            className="relative h-16 w-16 rounded-full shadow-lg"
          >
            {phase === "thinking" ? (
              <AsciiSpinner className="text-2xl" />
            ) : listening ? (
              <Square className="size-6" />
            ) : (
              <Mic className="size-6" />
            )}
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {phase === "thinking"
            ? "Thinking…"
            : phase === "speaking"
              ? "Speaking — tap mic to interrupt"
              : listening
                ? "Listening — tap to send"
                : "Tap to talk"}{" "}
          · <Kbd>Space</Kbd>
        </span>
      </div>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-4">
        <h2 className="mb-2 text-sm font-medium">{title}</h2>
        <div className="space-y-3">{children}</div>
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
