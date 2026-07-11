// Server Supabase client (route handlers, server components).
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components can't set cookies. Token refresh happens on the
            // next Route Handler call (API routes can set cookies) and via the
            // browser client's automatic refresh — there is no proxy/middleware
            // (Next 16 proxy is Node-only, unsupported by OpenNext Cloudflare).
          }
        },
      },
    }
  );
}
