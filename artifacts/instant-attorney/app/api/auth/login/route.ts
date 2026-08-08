import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  confirmTesterEmail,
  ensureTesterSubscription,
  isEmailNotConfirmedError,
  isTesterEmail,
} from "@/lib/testers";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const supabase = await createClient();
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // A QA tester whose confirmation email never landed would otherwise be
  // locked out with no self-serve recovery. Confirm the address server-side
  // (allowlist-only) and retry the sign-in once.
  if (error && isEmailNotConfirmedError(error) && isTesterEmail(email)) {
    if (await confirmTesterEmail(email)) {
      ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
    }
  }

  if (error) {
    // The raw Supabase strings ("Invalid login credentials", "Email not
    // confirmed") leave the user with no idea what to do next. Say what the
    // next action is, and tell the client when to offer a resend.
    const needsConfirmation = isEmailNotConfirmedError(error);
    const message = needsConfirmation
      ? "Your email address hasn't been confirmed yet. Check your inbox for the confirmation link, or send yourself a new one below."
      : /invalid login credentials/i.test(error.message)
        ? "That email and password don't match an account. Double-check them, or reset your password."
        : error.message;
    return NextResponse.json({ error: message, needsConfirmation }, { status: 401 });
  }

  // Role-aware home: the reviewing attorney (Andrew Crawford) belongs on his
  // review queue, never the client dashboard. Clients and attorney-users both
  // land on /dashboard — it already redirects an unapproved/unsubscribed
  // attorney-user to the right onboarding step (see app/dashboard/page.tsx).
  let redirectTo = "/dashboard";
  if (data.user) {
    // QA testers are always treated as paid — grant a bypass subscription.
    await ensureTesterSubscription(data.user.id, data.user.email);
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_attorney")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile?.is_attorney) redirectTo = "/attorney";
  }

  return NextResponse.json({ ok: true, redirectTo });
}
