import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureTesterSubscription } from "@/lib/testers";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
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
