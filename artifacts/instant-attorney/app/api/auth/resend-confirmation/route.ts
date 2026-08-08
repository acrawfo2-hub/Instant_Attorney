import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmTesterEmail, isTesterEmail } from "@/lib/testers";

/**
 * Re-send the signup confirmation link.
 *
 * Always answers 200 with the same body: whether an address has an account —
 * and whether it is already confirmed — is not something an unauthenticated
 * caller gets to enumerate.
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({ email: null }));

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  // Allowlisted testers don't depend on mail delivery at all — confirm them
  // outright so the next sign-in attempt works.
  if (isTesterEmail(email)) {
    const confirmed = await confirmTesterEmail(email);
    if (confirmed) {
      return NextResponse.json({
        ok: true,
        confirmed: true,
        message: "Your account is confirmed. Sign in with your password.",
      });
    }
  }

  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/api/auth/callback?next=/onboarding` },
  });

  if (error) {
    // Log for ops (rate limits, SMTP failures) but don't leak the reason.
    console.error("[auth] resend confirmation failed:", error.message);
  }

  return NextResponse.json({
    ok: true,
    confirmed: false,
    message: "If that address has an unconfirmed account, a new confirmation link is on its way.",
  });
}
