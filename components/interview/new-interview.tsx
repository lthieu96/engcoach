"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "@untitledui/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isLlmConfigured } from "@/lib/providers";
import { postLlm } from "@/lib/api";
import { LlmSetupNotice } from "@/components/llm-setup-notice";
import {
  INTERVIEW_KINDS,
  KIND_LABEL,
  SENIORITY,
  SENIORITY_LABEL,
  DURATIONS,
  COMPANY_STYLES,
  COMPANY_LABEL,
  TOPIC_SUGGESTIONS,
  type CompanyStyle,
  type InterviewKind,
  type Seniority,
} from "@/lib/interview";

export function NewInterview() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<InterviewKind>("system_design");
  const [level, setLevel] = useState<Seniority>("senior");
  const [minutes, setMinutes] = useState<number>(25);
  const [company, setCompany] = useState<CompanyStyle>("generic");
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState("");
  const [code, setCode] = useState("");
  const [starting, setStarting] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => setConfigured(isLlmConfigured()), [open]);

  async function start() {
    setStarting(true);
    try {
      const { id } = await postLlm<{ id: string }>("/api/interview", {
        kind,
        level,
        targetMinutes: minutes,
        company,
        question: question.trim() || undefined,
        topic: kind === "tech_deep_dive" ? topic.trim() || undefined : undefined,
        code: kind === "dsa_walkthrough" ? code.trim() || undefined : undefined,
      });
      router.push(`/interviews/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the interview");
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" /> New interview
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New mock interview</DialogTitle>
          <DialogDescription>
            Text chat with an AI interviewer. You&apos;ll get a hiring-rubric evaluation and an
            English report at the end.
          </DialogDescription>
        </DialogHeader>
        {!configured && <LlmSetupNotice feature="Mock interviews" />}
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <ToggleGroup
              value={[kind]}
              onValueChange={(v: string[]) => v[0] && setKind(v[0] as InterviewKind)}
              className="w-full"
            >
              {INTERVIEW_KINDS.map((k) => (
                <ToggleGroupItem key={k} value={k} className="flex-1">
                  {KIND_LABEL[k]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {kind === "tech_deep_dive" && (
            <div className="space-y-1.5">
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Anything you'd be grilled on — e.g. NestJS dependency injection"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {TOPIC_SUGGESTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTopic(t)}
                    className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Bar</Label>
            <ToggleGroup
              value={[level]}
              onValueChange={(v: string[]) => v[0] && setLevel(v[0] as Seniority)}
              className="w-full"
            >
              {SENIORITY.map((s) => (
                <ToggleGroupItem key={s} value={s} className="flex-1">
                  {SENIORITY_LABEL[s]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <Label>Duration</Label>
            <ToggleGroup
              value={[String(minutes)]}
              onValueChange={(v: string[]) => v[0] && setMinutes(Number(v[0]))}
              className="w-full"
            >
              {DURATIONS.map((d) => (
                <ToggleGroupItem key={d} value={String(d)} className="flex-1">
                  {d} min
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <Label>Style</Label>
            <ToggleGroup
              value={[company]}
              onValueChange={(v: string[]) => v[0] && setCompany(v[0] as CompanyStyle)}
              className="w-full"
            >
              {COMPANY_STYLES.map((c) => (
                <ToggleGroupItem key={c} value={c} className="flex-1">
                  {COMPANY_LABEL[c]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="question">
              Question <span className="text-muted-foreground">(optional — leave empty to generate)</span>
            </Label>
            <Textarea
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Paste your own question, e.g. from your System-Design notes…"
              rows={3}
            />
          </div>
          {kind === "dsa_walkthrough" && (
            <div className="space-y-1.5">
              <Label htmlFor="code">
                Your solution <span className="text-muted-foreground">(optional — adds a coding grade; you can also submit code during the interview)</span>
              </Label>
              <Textarea
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Solve it on LeetCode first, then paste your code here and walk it through…"
                rows={5}
                className="font-mono text-xs"
              />
            </div>
          )}
          <Button
            onClick={start}
            disabled={
              starting ||
              !configured ||
              (kind === "tech_deep_dive" && !topic.trim() && !question.trim())
            }
          >
            {starting ? "Setting up…" : "Start interview"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
