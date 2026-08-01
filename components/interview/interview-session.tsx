"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Code02 as Code, Send01 as Send, Trash01 as Trash } from "@untitledui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import { AsciiSpinner } from "@/components/ascii-spinner";
import { postLlm, openStream } from "@/lib/api";
import { KIND_LABEL, type InterviewKind } from "@/lib/interview";

type Turn = { idx: number; role: "interviewer" | "candidate"; content: string };

export function InterviewSession({
  id,
  kind,
  startedAt,
  targetMinutes,
  initialTurns,
}: {
  id: string;
  kind: InterviewKind;
  startedAt: string;
  targetMinutes: number;
  initialTurns: Turn[];
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [grading, setGrading] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  // Session clock, ticking once a second.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsedSec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const overTime = elapsedSec > targetMinutes * 60;
  const clock = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  async function send() {
    const content = draft.trim();
    if (!content || streaming) return;
    setDraft("");
    await sendContent(content);
  }

  async function sendContent(content: string) {
    const nextIdx = (turns.at(-1)?.idx ?? -1) + 1;
    setTurns((t) => [...t, { idx: nextIdx, role: "candidate", content }]);
    setStreaming(true);
    // Once the server responds ok, the candidate turn is persisted (the route
    // inserts it before streaming) — only then is losing the draft acceptable.
    let persisted = false;
    try {
      // Awaiting the open settles the request — past this line the server has
      // the candidate's turn, so a later failure must not restore the draft.
      const stream = await openStream("/api/interview/turn", { interviewId: id, content });
      persisted = true;
      setTurns((t) => [...t, { idx: nextIdx + 1, role: "interviewer", content: "" }]);
      let full = "";
      for await (const chunk of stream) {
        full += chunk;
        const snapshot = full;
        setTurns((t) => [...t.slice(0, -1), { idx: nextIdx + 1, role: "interviewer", content: snapshot }]);
      }
      if (!full.trim()) throw new Error("The model returned an empty reply");
    } catch (e) {
      // A partial interviewer reply was never persisted server-side — drop it
      // so the UI matches the DB instead of showing a ghost turn.
      setTurns((t) => (t.at(-1)?.role === "interviewer" ? t.slice(0, -1) : t));
      if (!persisted) {
        // The candidate turn never reached the server: undo the bubble and put
        // the text back in the box so the answer isn't lost.
        setTurns((t) => (t.at(-1)?.idx === nextIdx ? t.slice(0, -1) : t));
        setDraft((d) => d || content);
      }
      toast.error(e instanceof Error ? e.message : "Turn failed");
    } finally {
      setStreaming(false);
    }
  }

  // Submit solution code mid-interview (DSA): store it on the config so the
  // evaluator grades the coding axis, then post it as a normal turn so the
  // interviewer reacts to it and it lands in the transcript/replay.
  async function submitCode() {
    const trimmed = code.trim();
    if (!trimmed || streaming) return;
    setCodeOpen(false);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("interviews")
      .select("config")
      .eq("id", id)
      .single();
    const config = data?.config as Record<string, unknown> | undefined;
    if (error || !config) {
      toast.error(`Couldn't save the code: ${error?.message ?? "config not found"}`);
      return;
    }
    // Latest submission wins the coding grade.
    const { error: upErr } = await supabase
      .from("interviews")
      .update({ config: { ...config, code: trimmed } })
      .eq("id", id);
    if (upErr) {
      toast.error(`Couldn't save the code: ${upErr.message}`);
      return;
    }
    await sendContent(`Here's my solution:\n\`\`\`\n${trimmed}\n\`\`\``);
  }

  // Throw the session away without grading — deletes the row (turns cascade).
  async function discard() {
    const { error } = await createClient().from("interviews").delete().eq("id", id);
    if (error) {
      toast.error(`Couldn't discard: ${error.message}`);
      return;
    }
    router.replace("/interviews");
    router.refresh();
  }

  async function finish() {
    setGrading(true);
    try {
      const data = await postLlm<{ abandoned?: boolean }>("/api/interview/finish", {
        interviewId: id,
      });
      if (data.abandoned) {
        toast.info("Interview discarded — you hadn't answered yet");
        router.replace("/interviews");
        return;
      }
      router.refresh(); // status is now `completed` → the page re-renders as the report
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't grade the interview");
      setGrading(false);
    }
  }

  if (grading) {
    return (
      <div className="flex h-[calc(100dvh-3rem)] flex-col items-center justify-center gap-3 md:h-dvh">
        <AsciiSpinner className="text-2xl text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Grading your interview — rubric + English report…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-3rem)] max-w-3xl flex-col gap-3 p-4 md:h-dvh md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span className="text-sm font-medium">{KIND_LABEL[kind]}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs tabular-nums ${
              overTime ? "border-destructive/50 text-destructive" : "text-muted-foreground"
            }`}
          >
            {clock} / {targetMinutes}:00
          </span>
        </div>
        <span className="flex gap-1">
          {kind === "dsa_walkthrough" && (
            <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
              <DialogTrigger
                render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
              >
                <Code className="size-3.5" /> Code
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Submit your solution</DialogTitle>
                  <DialogDescription>
                    Sends the code to the interviewer and adds a coding grade to your evaluation.
                    Submitting again replaces it.
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste your solution code…"
                  rows={12}
                  className="font-mono text-xs"
                  autoFocus
                />
                <Button onClick={submitCode} disabled={streaming || !code.trim()}>
                  Submit code
                </Button>
              </DialogContent>
            </Dialog>
          )}
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
            >
              <Trash className="size-3.5" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard this interview?</AlertDialogTitle>
                <AlertDialogDescription>
                  Deletes the session without grading. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={discard}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Discard
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="sm" onClick={finish} disabled={streaming}>
            End interview
          </Button>
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-xl border bg-card p-4 shadow-xs">
        {turns.map((t, i) => (
          <Message key={t.idx} align={t.role === "candidate" ? "end" : "start"}>
            <MessageContent>
              <Bubble
                variant={t.role === "candidate" ? "default" : "muted"}
                align={t.role === "candidate" ? "end" : "start"}
              >
                <BubbleContent className="whitespace-pre-wrap text-[15px] leading-relaxed">
                  {t.content}
                  {streaming && t.role === "interviewer" && i === turns.length - 1 && (
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
                  )}
                </BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        ))}
      </div>

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
          placeholder="Your answer — short bullet-style is fine…"
          rows={2}
          className="min-h-0 flex-1 resize-none"
          autoFocus
        />
        <Button onClick={send} disabled={streaming || !draft.trim()} size="icon" className="shrink-0">
          {streaming ? <AsciiSpinner /> : <Send className="size-4" />}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        <Kbd>Enter</Kbd> send · <Kbd>Shift+Enter</Kbd> new line
      </p>
    </div>
  );
}
