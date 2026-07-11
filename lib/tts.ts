// Web Speech TTS helpers + per-device voice prefs. localStorage on purpose:
// the available voice list differs per browser/OS, so it can't sync via the DB.

const KEY = "engcoach:tts";

export type TtsEngine = "kokoro" | "system";
export type TtsPrefs = {
  engine: TtsEngine;
  voiceURI?: string; // system engine voice
  kokoroVoice: string;
  rate: number;
};

export const RATES = [
  { value: 0.75, label: "Slow (0.75×)" },
  { value: 0.9, label: "Relaxed (0.9×)" },
  { value: 1, label: "Normal (1×)" },
  { value: 1.1, label: "Brisk (1.1×)" },
  { value: 1.25, label: "Fast (1.25×)" },
] as const;

// Kept here (pure data) so the Settings UI can list voices without pulling
// kokoro-js + transformers into its bundle — the model loads via dynamic import.
export const KOKORO_VOICES = [
  { id: "af_heart", label: "Heart — US female" },
  { id: "af_bella", label: "Bella — US female" },
  { id: "af_nicole", label: "Nicole — US female, soft" },
  { id: "am_michael", label: "Michael — US male" },
  { id: "am_adam", label: "Adam — US male" },
  { id: "bf_emma", label: "Emma — UK female" },
  { id: "bm_george", label: "George — UK male" },
] as const;

const DEFAULTS: TtsPrefs = { engine: "kokoro", kokoroVoice: "af_heart", rate: 1 };

export function getTtsPrefs(): TtsPrefs {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "");
    return {
      engine: s.engine === "system" ? "system" : "kokoro",
      voiceURI: typeof s.voiceURI === "string" ? s.voiceURI : undefined,
      kokoroVoice: typeof s.kokoroVoice === "string" ? s.kokoroVoice : DEFAULTS.kokoroVoice,
      rate: typeof s.rate === "number" ? s.rate : 1,
    };
  } catch {
    return DEFAULTS;
  }
}

export function setTtsPrefs(p: TtsPrefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

// Quality heuristic — cloud/neural voices read far more naturally than the
// bare local defaults some OSes pick for en-US.
function voiceScore(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/google|natural|neural|online/.test(n)) s += 4;
  if (/premium|enhanced/.test(n)) s += 3;
  if (/samantha|siri/.test(n)) s += 2;
  if (v.lang.toLowerCase() === "en-us") s += 1;
  return s;
}

// macOS ships joke voices (Bahh, Bells, Zarvox…) that pollute the list and
// sound absurd reading dictation — exclude them entirely.
const NOVELTY =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph/;

function englishVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en") && !NOVELTY.test(v.name.toLowerCase()))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
}

/** English voices, best first — resolved async (Chrome populates the list lazily). */
export function getEnglishVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve([]);
    const now = englishVoices();
    if (now.length) return resolve(now);
    speechSynthesis.addEventListener("voiceschanged", () => resolve(englishVoices()), {
      once: true,
    });
    // Some browsers never fire voiceschanged (e.g. no voices at all).
    setTimeout(() => resolve(englishVoices()), 2000);
  });
}

// One engine per speech burst: while the Kokoro model is still downloading we
// fall back to the system voice, and this stickiness stops a mid-turn switch
// (system speaking sentence 1, Kokoro sentence 2 — overlapping audio).
// ponytail: 20s idle window re-evaluates; only matters during the first download.
let burstEngine: TtsEngine | null = null;
let burstTimer: ReturnType<typeof setTimeout> | undefined;

/** Speak via the configured engine (Kokoro when ready, system otherwise). */
export async function speakText(
  text: string,
  cb?: { onstart?: () => void; onend?: () => void }
): Promise<void> {
  const t = text.trim();
  if (!t || typeof window === "undefined") {
    cb?.onend?.();
    return;
  }
  const { engine, kokoroVoice, rate } = getTtsPrefs();

  clearTimeout(burstTimer);
  burstTimer = setTimeout(() => (burstEngine = null), 20_000);

  if (engine === "kokoro") {
    try {
      const k = await import("./kokoro");
      const ready = k.kokoroIfReady() !== null;
      burstEngine ??= ready ? "kokoro" : "system";
      if (burstEngine === "kokoro") {
        k.enqueueKokoro({ text: t, voice: kokoroVoice, speed: rate, ...cb });
        return;
      }
    } catch {
      // module failed to load — fall through to the system voice
    }
  }

  if (!window.speechSynthesis) {
    cb?.onend?.();
    return;
  }
  const u = makeUtterance(t);
  const end = () => cb?.onend?.();
  u.onstart = () => cb?.onstart?.();
  u.onend = end;
  u.onerror = end;
  window.speechSynthesis.speak(u);
}

/** Stop everything on both engines (barge-in, replay, leaving the page). */
export function cancelSpeech() {
  if (typeof window === "undefined") return;
  burstEngine = null;
  window.speechSynthesis?.cancel();
  void import("./kokoro").then((k) => k.cancelKokoro()).catch(() => {});
}

/** An utterance with the saved (or best-available) voice + rate applied. */
export function makeUtterance(text: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  const { voiceURI, rate } = getTtsPrefs();
  u.rate = rate;
  // Saved voice if present, else the highest-scored English voice — never
  // leave it to the OS default, which is what sounds "off" on many machines.
  const v =
    (voiceURI && speechSynthesis.getVoices().find((x) => x.voiceURI === voiceURI)) ||
    englishVoices()[0];
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  return u;
}
