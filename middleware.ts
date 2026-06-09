import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Routes that require an authenticated session
const AUTH_REQUIRED = ["/dashboard", "/chat", "/onboarding", "/wizard", "/attorney"];
// Redirect logged-in users away from these
const GUEST_ONLY = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // BYPASS_AUTH: skip all auth checks in dev
  if (BYPASS_AUTH) {
    const res = NextResponse.next();
    res.headers.set("x-bypass-auth", "true");
    return res;
  }

  const needsAuth = AUTH_REQUIRED.some((r) => pathname.startsWith(r));
  const isGuestOnly = GUEST_ONLY.some((r) => pathname.startsWith(r));

  if (!needsAuth && !isGuestOnly) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // createServerClient from @supabase/ssr is edge-compatible for auth only.
  // Do NOT make DB queries here — use Node.js runtime in API routes/pages for that.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
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

  // Redirect unauthenticated users away from protected routes
  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from guest-only routes
  if (isGuestOnly && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Subscription and attorney checks are handled in each page/API route
  // (they require DB queries which need the Node.js runtime, not Edge).

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/callback|api/subscriptions/webhook).*)",
  ],
};
