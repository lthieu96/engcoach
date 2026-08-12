// POST /api/task — generate a Compose task or a Translate (VN) prompt (Spec §6).
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveModel, llmError } from "@/lib/llm";
import { LlmBody } from "@/lib/llm-body";
import { ComposeTask, TranslateTask } from "@/lib/schemas";
import { composeTaskSystem, translateTaskSystem } from "@/lib/prompts";
import { getLearnerSettings } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const Body = z.object({
  mode: z.enum(["compose", "translate"]),
  translateKind: z.enum(["workplace", "interview"]).optional(),
  topic: z.string().trim().max(120).optional(),
  llm: LlmBody,
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  const { mode, translateKind, topic, llm } = parsed.data;
  if (mode === "translate" && translateKind === "interview" && !topic)
    return NextResponse.json({ error: "enter an interview topic" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Weak tags: most-frequent rule_tags in the last 30 days (Spec §1).
  // ponytail: fetches all 30d rows to count in JS — swap for a group-by RPC if this grows past a few hundred rows.
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: recent }, { data: recentDocs }] = await Promise.all([
    supabase.from("corrections").select("rule_tag").eq("user_id", user.id).gte("created_at", since),
    supabase
      .from("documents")
      .select("title")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const counts = new Map<string, number>();
  for (const r of recent ?? []) counts.set(r.rule_tag, (counts.get(r.rule_tag) ?? 0) + 1);
  const weakTags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  const recentScenarios = (recentDocs ?? []).map((d) => d.title).filter(Boolean) as string[];

  const { level, length } = await getLearnerSettings(supabase, user.id);
  const isTranslate = mode === "translate";
  try {
    const { object } = await generateObject({
      model: resolveModel(llm),
      schema: isTranslate ? TranslateTask : ComposeTask,
      system: isTranslate
        ? translateTaskSystem(
            weakTags,
            recentScenarios,
            level,
            length,
            translateKind === "interview" ? topic : undefined
          )
        : composeTaskSystem(weakTags, recentScenarios, level, length),
      prompt: "Generate one task now.",
    });
    return NextResponse.json(object);
  } catch (e) {
    return NextResponse.json({ error: llmError(e) }, { status: 502 });
  }
}
