// POST /api/grammar — generate three short drills for one recurring grammar pattern.
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveModel, llmError } from "@/lib/llm";
import { LlmBody } from "@/lib/llm-body";
import { grammarDrillSystem } from "@/lib/prompts";
import { getLevel } from "@/lib/profile";
import { GrammarDrillBatch } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { RULE_TAGS, TAG_CATEGORY } from "@/lib/taxonomy";

export const maxDuration = 30;

const Body = z.object({
  ruleTag: z.enum(RULE_TAGS),
  examples: z
    .array(
      z.object({
        original: z.string().trim().min(1).max(300),
        replacement: z.string().trim().min(1).max(300),
      })
    )
    .max(2),
  llm: LlmBody,
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || TAG_CATEGORY[parsed.data.ruleTag] !== "grammar") {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { ruleTag, examples, llm } = parsed.data;
  try {
    const { object } = await generateObject({
      model: resolveModel(llm),
      schema: GrammarDrillBatch,
      system: grammarDrillSystem(ruleTag, await getLevel(supabase, user.id), examples),
      prompt: "Generate the exercises now.",
    });
    return NextResponse.json(object);
  } catch (error) {
    return NextResponse.json({ error: llmError(error) }, { status: 502 });
  }
}
