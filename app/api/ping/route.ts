// GET /api/ping — keep Supabase from pausing after 7 idle days (Plan §7).
// Hit daily by a Cloudflare Cron Trigger.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  await supabase.from("profiles").select("id").limit(1);
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
