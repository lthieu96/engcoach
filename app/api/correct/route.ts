// POST /api/correct — grade writing, anchor spans server-side, persist (Spec §6).
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveModel, llmError } from "@/lib/llm";
import { CorrectionResult, TranslateResult } from "@/lib/schemas";
import { correctionSystem, translateGradeSystem } from "@/lib/prompts";
import { getLevel } from "@/lib/profile";
import { anchor } from "@/lib/anchor";
import { createClient } from "@/lib/supabase/server";
import { CHANNELS, TAG_CATEGORY } from "@/lib/taxonomy";
import { LlmBody } from "@/lib/llm-body";

export const maxDuration = 30;

// Validate BEFORE the LLM call — a bad body must not burn quota or hit CHECK constraints.
const Body = z.object({
  text: z.string().trim().min(1).max(10_000),
  channel: z.enum(CHANNELS),
  mode: z.enum(["compose", "translate", "paste"]),
  vietnamese: z.string().optional(),
  title: z.string().nullish(),
  llm: LlmBody,
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const { text, channel, mode, vietnamese, title, llm } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const level = await getLevel(supabase, user.id);
  const isTranslate = mode === "translate";
  let object;
  try {
    ({ object } = await generateObject({
      model: resolveModel(llm),
      schema: isTranslate ? TranslateResult : CorrectionResult,
      system: isTranslate ? translateGradeSystem(level) : correctionSystem(channel, level),
      prompt: isTranslate
        ? `Vietnamese source:\n${vietnamese ?? ""}\n\nEnglish attempt:\n${text}`
        : text,
    }));
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }

  // Anchor against the user's English text; drop anything that doesn't match.
  const { anchored, dropped } = anchor(text, object.corrections);
  if (dropped.length) console.warn(`[correct] dropped ${dropped.length} unanchorable corrections`);

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      title: title ?? null,
      context: channel,
      mode,
      original_text: text,
      natural_rewrite: object.natural_rewrite,
      overall_comment: object.overall_comment,
    })
    .select("id")
    .single();
  if (docError || !doc) {
    console.error("[correct] document insert failed:", docError?.message);
    return NextResponse.json({ error: "failed to save document" }, { status: 500 });
  }

  // Insert + select in one round trip; category derived from rule_tag, never from the LLM.
  let saved: unknown[] = [];
  if (anchored.length) {
    const { data, error } = await supabase
      .from("corrections")
      .insert(
        anchored.map((c) => ({
          document_id: doc.id,
          user_id: user.id,
          span_start: c.start,
          span_end: c.end,
          original: c.original,
          replacement: c.replacement,
          category: TAG_CATEGORY[c.rule_tag],
          rule_tag: c.rule_tag,
          severity: c.severity,
          explanation: c.explanation,
        }))
      )
      .select("*")
      .order("span_start");
    if (error) {
      console.error("[correct] corrections insert failed:", error.message);
      return NextResponse.json({ error: "failed to save corrections" }, { status: 500 });
    }
    saved = data;
  }

  return NextResponse.json({
    documentId: doc.id,
    corrections: saved,
    natural_rewrite: object.natural_rewrite,
    overall_comment: object.overall_comment,
    ...("meaning_score" in object && "alternatives" in object
      ? { meaning_score: object.meaning_score, alternatives: object.alternatives }
      : {}),
    dropped: dropped.length,
  });
}
