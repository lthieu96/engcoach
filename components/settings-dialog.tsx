"use client";

import { useEffect, useState } from "react";
import {
  Sliders02 as Settings2,
  RefreshCw01 as RefreshCw,
  Check,
  ChevronSelectorVertical as ChevronsUpDown,
  Eye,
  EyeOff,
  CornerDownLeft,
} from "@untitledui/icons";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { PROVIDERS, preset, getLlm, getProviderConfig, setLlm, type LlmConfig } from "@/lib/providers";
import { Switch } from "@/components/ui/switch";
import {
  LEVELS,
  LEVEL_LABEL,
  DEFAULT_LEVEL,
  LENGTHS,
  LENGTH_LABEL,
  DEFAULT_LENGTH,
  type Level,
  type TaskLength,
} from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import {
  getTtsPrefs,
  setTtsPrefs,
  getEnglishVoices,
  cancelSpeech,
  RATES,
  KOKORO_VOICES,
  type TtsEngine,
} from "@/lib/tts";
import { cn } from "@/lib/utils";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<LlmConfig>({ provider: "google", model: "" });
  const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>(DEFAULT_LEVEL);
  const [length, setLength] = useState<TaskLength>(DEFAULT_LENGTH);
  const [autoTask, setAutoTask] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [engine, setEngine] = useState<TtsEngine>("kokoro");
  const [voiceURI, setVoiceURI] = useState("");
  const [kokoroVoice, setKokoroVoice] = useState("af_heart");
  const [rate, setRate] = useState(1);
  const [previewing, setPreviewing] = useState(false);
  const [kokoroStatus, setKokoroStatus] = useState<import("@/lib/kokoro").KokoroStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const p = preset(cfg.provider);
  const suggestions = models.length ? models : (p?.models ?? []);
  const q = search.trim().toLowerCase();
  const filtered = q ? suggestions.filter((m) => m.toLowerCase().includes(q)) : suggestions;
  const custom = search.trim();
  const showCustom = !!custom && !suggestions.some((m) => m.toLowerCase() === q);

  function openDialog() {
    setCfg(getProviderConfig(getLlm().provider));
    setModels([]);
    setShowKey(false);
    setOpen(true);
    // Voice prefs are per-device (voice lists differ per browser/OS).
    const tts = getTtsPrefs();
    setEngine(tts.engine);
    setVoiceURI(tts.voiceURI ?? "");
    setKokoroVoice(tts.kokoroVoice);
    setRate(tts.rate);
    getEnglishVoices().then(setVoices);
    // Learner settings live in profiles.settings (sync across devices).
    createClient()
      .from("profiles")
      .select("settings")
      .single()
      .then(({ data }) => {
        const s = (data?.settings ?? {}) as { level?: string; length?: string; auto_task?: boolean };
        if ((LEVELS as readonly string[]).includes(s.level ?? "")) setLevel(s.level as Level);
        if ((LENGTHS as readonly string[]).includes(s.length ?? ""))
          setLength(s.length as TaskLength);
        setAutoTask(s.auto_task ?? true);
      });
  }

  // "Configure provider" buttons elsewhere (LlmSetupNotice) open this dialog.
  useEffect(() => {
    const open = () => openDialog();
    window.addEventListener("open-llm-settings", open);
    return () => window.removeEventListener("open-llm-settings", open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect Kokoro load status while the dialog is open on the neural engine.
  // Dynamic import loads the wrapper only (not the 90MB weights) — subscribing
  // never triggers the download; that stays gated behind Preview/Test.
  useEffect(() => {
    if (!open || engine !== "kokoro") return;
    let unsub = () => {};
    let alive = true;
    import("@/lib/kokoro").then((k) => {
      if (!alive) return;
      setKokoroStatus(k.getKokoroStatus());
      unsub = k.subscribeKokoro(setKokoroStatus);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [open, engine]);

  async function testVoice() {
    setTesting(true);
    const k = await import("@/lib/kokoro");
    if (!k.getKokoroStatus().state.match(/ready|loading/))
      toast.info("Downloading the voice model (~90 MB, one time)…");
    const ok = await k.testKokoro(kokoroVoice);
    setTesting(false);
    toast[ok ? "success" : "error"](ok ? "Voice model works" : "Voice model failed to run");
  }

  function changeProvider(id: string) {
    setModels([]);
    // Load this provider's saved key/model — switching never loses a key.
    const saved = getProviderConfig(id);
    setCfg({ ...saved, model: saved.model || (preset(id)?.defaultModel ?? "") });
  }

  function pickModel(model: string) {
    setCfg((c) => ({ ...c, model }));
    setModelOpen(false);
    setSearch("");
  }

  async function fetchModels() {
    setFetching(true);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const { models: list } = await res.json();
      const ids = (list ?? []).map((m: { id: string }) => m.id);
      setModels(ids);
      if (!ids.length) toast.error("No models returned — check the key / base URL.");
      else setModelOpen(true);
    } catch {
      toast.error("Couldn't fetch models");
    } finally {
      setFetching(false);
    }
  }

  async function previewVoice() {
    const SAMPLE = "Quick heads-up — the deploy hit an issue, we're rolling back now.";
    cancelSpeech();
    if (engine === "kokoro") {
      setPreviewing(true);
      const k = await import("@/lib/kokoro");
      if (!k.kokoroIfReady()) toast.info("Downloading the voice model (~90 MB, one time)…");
      k.enqueueKokoro({
        text: SAMPLE,
        voice: kokoroVoice,
        speed: rate,
        onstart: () => setPreviewing(false),
        onend: () => setPreviewing(false),
      });
      return;
    }
    const u = new SpeechSynthesisUtterance(SAMPLE);
    u.rate = rate;
    const v = voices.find((x) => x.voiceURI === voiceURI);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = "en-US";
    speechSynthesis.speak(u);
  }

  async function save() {
    setSaving(true);
    setLlm(cfg);
    setTtsPrefs({ engine, voiceURI: voiceURI || undefined, kokoroVoice, rate });
    // Merge level into profiles.settings (read-modify-write; single-user edit).
    const supabase = createClient();
    const { data } = await supabase.from("profiles").select("id, settings").single();
    if (data) {
      const { error } = await supabase
        .from("profiles")
        .update({
          settings: { ...(data.settings as object), level, length, auto_task: autoTask },
        })
        .eq("id", data.id);
      if (error) toast.error(`Couldn't save settings: ${error.message}`);
    }
    setSaving(false);
    setOpen(false);
    toast.success(`Using ${preset(cfg.provider)?.label ?? cfg.provider} · ${level}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<SidebarMenuButton onClick={openDialog} />}>
        <Settings2 />
        <span>Settings</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md border bg-background shadow-xs">
              <Settings2 className="size-4" />
            </span>
            Settings
          </DialogTitle>
          <DialogDescription>
            The API key stays in this browser only — never sent to our database. It is used per
            request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Learner settings — drive task, dictation and chat difficulty */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              English level
              <NativeSelect
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
                className="mt-1 w-full"
              >
                {LEVELS.map((l) => (
                  <NativeSelectOption key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="block text-sm">
              Task length
              <NativeSelect
                value={length}
                onChange={(e) => setLength(e.target.value as TaskLength)}
                className="mt-1 w-full"
              >
                {LENGTHS.map((l) => (
                  <NativeSelectOption key={l} value={l}>
                    {LENGTH_LABEL[l]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          </div>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Auto-generate tasks
              <span className="block text-xs text-muted-foreground">
                Generate writing tasks and dictation sentences as soon as you open a page.
              </span>
            </span>
            <Switch checked={autoTask} onCheckedChange={setAutoTask} />
          </label>

          {/* Voice — per-device (engines and voice lists vary per browser/OS) */}
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Voice
            <button
              type="button"
              onClick={previewVoice}
              disabled={previewing}
              className="flex items-center gap-1 text-xs font-normal normal-case tracking-normal hover:text-foreground disabled:opacity-50"
            >
              {previewing ? "Generating…" : "Preview"}
            </button>
          </div>
          <label className="block text-sm">
            Engine
            <NativeSelect
              value={engine}
              onChange={(e) => setEngine(e.target.value as TtsEngine)}
              className="mt-1 w-full"
            >
              <NativeSelectOption value="kokoro">
                Neural — Kokoro, in-browser (~90 MB one-time download)
              </NativeSelectOption>
              <NativeSelectOption value="system">System — built-in voices</NativeSelectOption>
            </NativeSelect>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              Voice
              {engine === "kokoro" ? (
                <NativeSelect
                  value={kokoroVoice}
                  onChange={(e) => setKokoroVoice(e.target.value)}
                  className="mt-1 w-full"
                >
                  {KOKORO_VOICES.map((v) => (
                    <NativeSelectOption key={v.id} value={v.id}>
                      {v.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <NativeSelect
                  value={voiceURI}
                  onChange={(e) => setVoiceURI(e.target.value)}
                  className="mt-1 w-full"
                >
                  <NativeSelectOption value="">Auto — best available</NativeSelectOption>
                  {voices.map((v) => (
                    <NativeSelectOption key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </label>
            <label className="block text-sm">
              Speed
              <NativeSelect
                value={String(rate)}
                onChange={(e) => setRate(Number(e.target.value))}
                className="mt-1 w-full"
              >
                {RATES.map((r) => (
                  <NativeSelectOption key={r.value} value={String(r.value)}>
                    {r.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          </div>

          {/* Kokoro model health: loaded? working? */}
          {engine === "kokoro" && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    kokoroStatus?.state === "ready"
                      ? "bg-green-500"
                      : kokoroStatus?.state === "error"
                        ? "bg-destructive"
                        : kokoroStatus?.state === "loading"
                          ? "animate-pulse bg-amber-500"
                          : "bg-muted-foreground/40"
                  )}
                />
                <span className="text-muted-foreground">
                  {kokoroStatus?.state === "ready"
                    ? `Model ready${kokoroStatus.device ? ` · ${kokoroStatus.device}` : ""}`
                    : kokoroStatus?.state === "loading"
                      ? `Downloading… ${kokoroStatus.progress}%`
                      : kokoroStatus?.state === "error"
                        ? "Model failed to load"
                        : "Model not downloaded yet"}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={testVoice}
                disabled={testing || kokoroStatus?.state === "loading"}
              >
                {testing ? "Testing…" : kokoroStatus?.state === "ready" ? "Re-test" : "Test"}
              </Button>
            </div>
          )}

          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            AI provider
          </div>
          {/* Provider grid */}
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((pr) => {
              const active = cfg.provider === pr.id;
              return (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => changeProvider(pr.id)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "border-primary/50 bg-primary/5 font-medium text-foreground"
                      : "text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  <span className="truncate">{pr.label}</span>
                  {active && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>

          {p?.kind === "compatible" && (
            <label className="block text-sm">
              Base URL
              <Input
                value={cfg.baseURL ?? ""}
                onChange={(e) => setCfg({ ...cfg, baseURL: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="mt-1"
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="flex items-center justify-between">
              <span>API key</span>
              {p?.keyUrl && (
                <a
                  href={p.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Get an API key ↗
                </a>
              )}
            </span>
            <div className="relative mt-1">
              <Input
                type={showKey ? "text" : "password"}
                value={cfg.apiKey ?? ""}
                onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
                placeholder="sk-…"
                className="pr-9"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          <div className="text-sm">
            <span className="flex items-center justify-between">
              Model
              <button
                type="button"
                onClick={fetchModels}
                disabled={fetching}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`size-3 ${fetching ? "animate-spin" : ""}`} /> fetch list
              </button>
            </span>
            <Popover
              open={modelOpen}
              onOpenChange={(o) => {
                setModelOpen(o);
                if (!o) setSearch("");
              }}
            >
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    role="combobox"
                    className="mt-1 w-full justify-between font-normal"
                  />
                }
              >
                <span className={cn("truncate", !cfg.model && "text-muted-foreground")}>
                  {cfg.model || p?.defaultModel || "Select or type a model…"}
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
                {/* Local filtering so a query that matches nothing can still become a custom id */}
                <Command shouldFilter={false}>
                  <CommandInput
                    value={search}
                    onValueChange={setSearch}
                    placeholder="Search or type a model id…"
                  />
                  <CommandList className="max-h-56">
                    <CommandEmpty>Type a model id and press Enter.</CommandEmpty>
                    {showCustom && (
                      <CommandItem value={`__custom:${custom}`} onSelect={() => pickModel(custom)}>
                        <CornerDownLeft className="size-3.5 text-muted-foreground" />
                        Use “{custom}”
                      </CommandItem>
                    )}
                    {filtered.map((m) => (
                      <CommandItem key={m} value={m} onSelect={() => pickModel(m)}>
                        <Check
                          className={cn("size-4", m === cfg.model ? "opacity-100" : "opacity-0")}
                        />
                        {m}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {models.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {models.length} models loaded from the API.
              </p>
            )}
          </div>

          {p?.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
