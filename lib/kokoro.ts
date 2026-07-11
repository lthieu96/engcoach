// Kokoro-82M neural TTS running fully in the browser (WebGPU, WASM fallback).
// Loaded lazily via dynamic import — never on the server, never in the main bundle.
import { KokoroTTS } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let loader: Promise<KokoroTTS> | null = null;
let instance: KokoroTTS | null = null;

// Observable load status so the UI can show "downloading 45% / ready / failed".
export type KokoroStatus = {
  state: "idle" | "loading" | "ready" | "error";
  progress: number; // 0–100 during download
  error?: string;
  device?: "webgpu" | "wasm";
};
let status: KokoroStatus = { state: "idle", progress: 0 };
const listeners = new Set<(s: KokoroStatus) => void>();

function setStatus(patch: Partial<KokoroStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function getKokoroStatus(): KokoroStatus {
  return status;
}

export function subscribeKokoro(cb: (s: KokoroStatus) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function loadKokoro(): Promise<KokoroTTS> {
  loader ??= (async () => {
    const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
    const device = webgpu ? ("webgpu" as const) : ("wasm" as const);
    setStatus({ state: "loading", progress: 0, error: undefined, device });
    try {
      const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: webgpu ? "fp32" : "q8", // q8 artifacts on webgpu; fp32 is fine there
        device,
        // Weighted download progress across the model's files.
        progress_callback: (p: { status: string; progress?: number }) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            setStatus({ progress: Math.round(p.progress) });
          }
        },
      });
      instance = tts;
      setStatus({ state: "ready", progress: 100 });
      return tts;
    } catch (e) {
      setStatus({ state: "error", error: e instanceof Error ? e.message : "Failed to load model" });
      throw e;
    }
  })();
  return loader;
}

/** Instance if the model finished loading; kicks off the download otherwise. */
export function kokoroIfReady(): KokoroTTS | null {
  void loadKokoro().catch(() => {
    loader = null; // allow retry after a failed load
  });
  return instance;
}

/** Load (if needed) and generate one short clip — proves the model actually works. */
export async function testKokoro(voice: string): Promise<boolean> {
  try {
    const tts = await loadKokoro();
    const audio = await tts.generate("This is a test.", { voice: voice as "af_heart" });
    return audio.audio.length > 0;
  } catch {
    return false;
  }
}

type Job = {
  text: string;
  voice: string;
  speed: number;
  onstart?: () => void;
  onend?: () => void;
};

const queue: Job[] = [];
let pumping = false;
let generation = 0; // bumped by cancel — invalidates in-flight work
let stopCurrent: (() => void) | null = null;

export function enqueueKokoro(job: Job) {
  queue.push(job);
  void pump();
}

export function cancelKokoro() {
  generation++;
  for (const j of queue.splice(0)) j.onend?.(); // release waiters (phase counters)
  stopCurrent?.();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  const gen = generation;
  while (queue.length && gen === generation) {
    const job = queue.shift()!;
    try {
      const tts = await loadKokoro();
      const audio = await tts.generate(job.text, {
        voice: job.voice as "af_heart",
        speed: job.speed,
      });
      if (gen !== generation) {
        job.onend?.();
        break;
      }
      const url = URL.createObjectURL(audio.toBlob());
      await new Promise<void>((resolve) => {
        const a = new Audio(url);
        const done = () => {
          stopCurrent = null;
          URL.revokeObjectURL(url);
          resolve();
        };
        stopCurrent = () => {
          a.pause();
          done();
        };
        a.onended = done;
        a.onerror = done;
        job.onstart?.();
        a.play().catch(done);
      });
      job.onend?.();
    } catch {
      job.onend?.();
    }
  }
  pumping = false;
  if (queue.length && gen === generation) void pump();
}
