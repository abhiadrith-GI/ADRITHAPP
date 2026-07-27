import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs on every request. Two jobs:
 *   1. Refresh the Supabase auth session so it doesn't silently expire.
 *   2. Redirect signed-out users away from anything under /dashboard.
 *
 * IMPORTANT: this is a UX convenience layer, not the real security boundary.
 * It exists so a signed-out user is redirected to /login instead of seeing a
 * broken/empty dashboard — nothing more. The actual data access control is
 * enforced by Postgres Row Level Security (see supabase/schema.sql), which
 * checks project membership / admin status on every single query regardless
 * of what happens at this layer. Even if this middleware were skipped
 * entirely, RLS still blocks unauthorized reads and writes — this is
 * deliberate defense-in-depth, not an accident. Never add a permission check
 * here as the *only* place it's enforced.
 */
export async function proxy(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedRoute = request.nextUrl.pathname.startsWith("/dashboard");

  if (isProtectedRoute && !user) {
    const redirectUrl = new URL("/login", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
