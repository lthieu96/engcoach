// POST /api/card — make a cloze flashcard from a correction (Spec §3.5, §4).
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError } from "@/lib/llm";
import { Flashcard } from "@/lib/schemas";
import { flashcardSystem } from "@/lib/prompts";
import { newCard } from "@/lib/fsrs";
import { createClient } from "@/lib/supabase/server";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 30;

type Body = {
  correctionId?: string;
  // Direct card (from a chat report or manual add) — no correction row involved.
  front?: string;
  back?: string;
  source?: "manual" | "chat";
  llm?: Partial<LlmConfig>;
};

export async function POST(req: Request) {
  const { correctionId, front, back, source, llm }: Body = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Direct card path: pre-formed front/back (chat report, manual).
  if (!correctionId) {
    if (!front?.trim() || !back?.trim())
      return NextResponse.json({ error: "front and back required" }, { status: 400 });
    const card = newCard();
    const { data, error } = await supabase
      .from("cards")
      .insert({
        user_id: user.id,
        front,
        back,
        source: source === "manual" ? "manual" : "chat",
        fsrs: card,
        due: card.due,
      })
      .select("id, front, back")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data: corr } = await supabase
    .from("corrections")
    .select("*, documents(original_text)")
    .eq("id", correctionId)
    .single();
  if (!corr) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Dedup: same rule_tag + similar original → bump counter instead of a new card (Spec §4).
  // Match via the existing card's source correction (cards don't store `original`).
  const pattern = corr.original.replace(/[\\%_]/g, (m: string) => `\\${m}`);
  const { data: dups } = await supabase
    .from("cards")
    .select("id, seen_count, corrections!inner(original)")
    .eq("user_id", user.id)
    .eq("rule_tag", corr.rule_tag)
    .ilike("corrections.original", pattern)
    .limit(1);
  const dup = dups?.[0];
  if (dup) {
    await supabase.from("cards").update({ seen_count: dup.seen_count + 1 }).eq("id", dup.id);
    return NextResponse.json({ id: dup.id, deduped: true });
  }

  const sentence = corr.documents?.original_text ?? corr.original;
  let object;
  try {
    ({ object } = await generateObject({
      model: resolveModel(llm),
      schema: Flashcard,
      system: flashcardSystem,
      prompt: `Original sentence: ${sentence}
Wrong span: "${corr.original}"
Correct span: "${corr.replacement}"
Rule: ${corr.rule_tag}
Explanation: ${corr.explanation}`,
    }));
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }

  const card = newCard();
  const { data: inserted } = await supabase
    .from("cards")
    .insert({
      user_id: user.id,
      front: object.front,
      back: object.back,
      source: "correction",
      correction_id: correctionId,
      rule_tag: corr.rule_tag,
      fsrs: card,
      due: card.due,
    })
    .select("id, front, back")
    .single();

  return NextResponse.json(inserted);
}
