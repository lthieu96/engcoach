// GET /api/ping — keep Supabase from pausing after 7 idle days (Plan §7).
// Hit daily by a Vercel Cron Job (see vercel.json). Public by design (proxy
// allowlists it) so the scheduler can reach it without a session.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  await supabase.from("profiles").select("id").limit(1);
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
