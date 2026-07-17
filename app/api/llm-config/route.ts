// Synced LLM provider config (opt-in). The browser's localStorage store is
// encrypted server-side (lib/crypto.ts) and kept on the user's profile row so
// keys follow the user across devices without sitting in the DB as plaintext.
import { NextResponse } from "next/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabase.from("profiles").select("llm_config").single();
  if (!data?.llm_config) return NextResponse.json({ store: null });
  try {
    return NextResponse.json({ store: JSON.parse(decrypt(data.llm_config)) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "decrypt failed" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.store?.byProvider) return NextResponse.json({ error: "bad request" }, { status: 400 });
  let blob: string;
  try {
    blob = encrypt(JSON.stringify(body.store));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "encrypt failed" },
      { status: 500 }
    );
  }
  const { error } = await supabase
    .from("profiles")
    .update({ llm_config: blob })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase
    .from("profiles")
    .update({ llm_config: null })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
