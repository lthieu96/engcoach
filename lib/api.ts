"use client";
// The browser's one door to /api. Every route answers JSON and puts its reason
// in `error`, so no call site should ever re-derive that — or silently drop it.
import { getLlm } from "./providers";

async function reason(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  return (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
}

async function send(url: string, body: unknown, method: string): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Every route returns 401 the same way, and it never means what the route says.
  if (res.status === 401) throw new Error("Session expired — please sign in again.");
  return res;
}

/** POST (or PUT/DELETE) JSON and read JSON back. Throws the server's own message. */
export async function post<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await send(url, body, method);
  if (!res.ok) throw new Error(await reason(res));
  return res.json() as Promise<T>;
}

/** Same, plus the user's provider config — every LLM-backed route needs it. */
export function postLlm<T>(url: string, body: Record<string, unknown> = {}): Promise<T> {
  return post<T>(url, { ...body, llm: getLlm() });
}

/**
 * Open a streaming route. Awaiting this settles the REQUEST (it throws if the
 * server rejected it), then iterate the result for decoded text chunks — so a
 * caller can still tell "never accepted" from "accepted but died mid-stream".
 */
export async function openStream(
  url: string,
  body: Record<string, unknown>
): Promise<AsyncIterable<string>> {
  const res = await send(url, { ...body, llm: getLlm() }, "POST");
  if (!res.ok || !res.body) throw new Error(await reason(res));
  return decode(res.body);
}

async function* decode(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield decoder.decode(value, { stream: true });
  }
}
