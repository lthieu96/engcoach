// POST /api/card — make a cloze flashcard from a correction (Spec §3.5, §4).
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { resolveModel, llmError, GRADING } from "@/lib/llm";
import { sentenceAt } from "@/lib/anchor";
import { Flashcard, VocabItem } from "@/lib/schemas";
import { flashcardSystem, vocabFillSystem } from "@/lib/prompts";
import { getLevel } from "@/lib/profile";
import { newCard } from "@/lib/fsrs";
import { createClient } from "@/lib/supabase/server";
import type { LlmConfig } from "@/lib/providers";

export const maxDuration = 30;

type Body = {
  correctionId?: string;
  // Direct card (from a chat/interview report or manual add) — no correction row involved.
  front?: string;
  back?: string;
  source?: "manual" | "chat" | "interview";
  // Vocab card: `term` alone is enough — meaning + example get filled in.
  kind?: "sentence" | "vocab";
  term?: string;
  meaning?: string;
  example?: string;
  context?: string; // the sentence the term was highlighted in, if any
  llm?: Partial<LlmConfig>;
};

export async function POST(req: Request) {
  const {
    correctionId,
    front,
    back,
    source,
    kind,
    term,
    meaning,
    example,
    context,
    llm,
  }: Body = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Vocab card: front = English term, back = Vietnamese meaning. Review flips the
  // direction, so both sides must stand on their own.
  if (kind === "vocab") {
    if (!term?.trim()) return NextResponse.json({ error: "term required" }, { status: 400 });

    // One card per term — saving the same phrase twice just bumps the counter.
    const { data: dups } = await supabase
      .from("cards")
      .select("id, seen_count")
      .eq("user_id", user.id)
      .eq("kind", "vocab")
      .ilike("front", term.trim().replace(/[\\%_]/g, (m) => `\\${m}`))
      .limit(1);
    if (dups?.[0]) {
      await supabase
        .from("cards")
        .update({ seen_count: dups[0].seen_count + 1 })
        .eq("id", dups[0].id);
      return NextResponse.json({ id: dups[0].id, deduped: true });
    }

    let item: VocabItem = {
      term: term.trim(),
      meaning_vi: meaning?.trim() ?? "",
      example: example?.trim() ?? "",
    };
    // Highlighted by hand → we only have the term; ask for the meaning + example.
    if (!item.meaning_vi) {
      try {
        const { object } = await generateObject({
          ...GRADING,
          model: resolveModel(llm),
          schema: VocabItem,
          system: vocabFillSystem(await getLevel(supabase, user.id)),
          prompt: `Term: ${item.term}${context ? `\nSeen in: ${context}` : ""}`,
        });
        item = object;
      } catch (e) {
        return NextResponse.json({ error: llmError(e) }, { status: 502 });
      }
    }

    const card = newCard();
    const { data, error } = await supabase
      .from("cards")
      .insert({
        user_id: user.id,
        kind: "vocab",
        front: item.term,
        back: item.meaning_vi,
        example: item.example || null,
        source: source === "chat" || source === "interview" ? source : "manual",
        fsrs: card,
        due: card.due,
      })
      .select("id, front, back")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

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
        source: source === "manual" || source === "interview" ? source : "chat",
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
    .select("*, documents(original_text, context, title)")
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

  // The sentence the mistake lives in — sliced from the span, so the card can't
  // end up clozing a fragment the model picked out of a multi-sentence draft.
  const doc = corr.documents?.original_text;
  const sentence = doc ? sentenceAt(doc, corr.span_start, corr.span_end) : corr.original;
  let object;
  try {
    ({ object } = await generateObject({
      ...GRADING,
      model: resolveModel(llm),
      schema: Flashcard,
      system: flashcardSystem,
      prompt: `Original sentence: ${sentence}
Situation: ${corr.documents?.title ?? "workplace message"} (${corr.documents?.context ?? "slack"})
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
