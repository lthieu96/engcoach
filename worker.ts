// Custom Workers entry: OpenNext's fetch handler + a scheduled() handler for the
// daily Supabase keep-alive (Plan §7 — free projects pause after 7 idle days).
// `opennextjs-cloudflare build` generates .open-next/worker.js; wrangler bundles this file.
// Excluded from tsconfig — the import target only exists after a build.
// @ts-ignore generated at build time
import handler from "./.open-next/worker.js";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
}

export default {
  fetch: handler.fetch,

  // One REST query = DB activity. Hits PostgREST directly — no need to route
  // through the Next app (RLS returns [] for anon; the query still executes).
  async scheduled(_controller: unknown, env: Env) {
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    });
  },
};
