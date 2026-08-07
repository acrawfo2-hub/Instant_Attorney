import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Send a password-recovery link.
 *
 * The link lands on /api/auth/callback, which exchanges the code for a session
 * and forwards to /reset-password where the new password is set. Always
 * answers 200 so the endpoint can't be used to enumerate accounts.
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({ email: null }));

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/api/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error("[auth] password reset send failed:", error.message);
  }

  return NextResponse.json({
    ok: true,
    message: "If that address has an account, a password reset link is on its way.",
  });
}
