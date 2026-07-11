// Session refresh for server components (@supabase/ssr standard pattern).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Local JWT validation (no Auth-server round trip per request); also refreshes
  // the session cookie. Route handlers keep their own authoritative getUser().
  const { data } = await supabase.auth.getClaims();
  const authed = !!data?.claims;

  // Gate everything except the login page and the auth callback.
  const path = request.nextUrl.pathname;
  const isPublic = path === "/login" || path.startsWith("/auth") || path.startsWith("/api/ping");
  if (!authed && !isPublic) {
    // API callers need a parseable 401, not a 307 to an HTML login page.
    if (path.startsWith("/api")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
