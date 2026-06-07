import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Routes that require an authenticated session
const AUTH_REQUIRED = ["/dashboard", "/chat", "/onboarding", "/wizard", "/attorney"];
// Routes that require a completed subscription (agreement + consent + payment)
const SUBSCRIPTION_REQUIRED = ["/dashboard", "/chat", "/wizard"];
// Routes that require is_attorney = true
const ATTORNEY_REQUIRED = ["/attorney"];
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

  // Only run auth logic on routes that care about it
  const needsAuth = AUTH_REQUIRED.some((r) => pathname.startsWith(r));
  const needsSub = SUBSCRIPTION_REQUIRED.some((r) => pathname.startsWith(r));
  const needsAttorney = ATTORNEY_REQUIRED.some((r) => pathname.startsWith(r));
  const isGuestOnly = GUEST_ONLY.some((r) => pathname.startsWith(r));

  if (!needsAuth && !isGuestOnly) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

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

  // For attorney-only routes, check is_attorney flag
  if (needsAttorney && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_attorney")
      .eq("id", user.id)
      .single();

    if (!profile?.is_attorney) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // For subscription-required routes, check onboarding completion
  if (needsSub && user) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub || (sub.status !== "active" && sub.status !== "trialing" && sub.status !== "bypass")) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/callback|api/subscriptions/webhook).*)",
  ],
};
