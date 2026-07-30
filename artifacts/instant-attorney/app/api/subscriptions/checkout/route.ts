import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, PHASE2_PRICE_ID, PLAN_PRICE_IDS } from "@/lib/stripe";
import { BYPASS_USER_ID } from "@/lib/types";
import { getAppUrl } from "@/lib/app-url";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { plan } = await req.json();
  const origin = getAppUrl(req.nextUrl.origin);

  // BYPASS: skip Stripe entirely, provision subscription directly
  if (BYPASS_AUTH) {
    const db = createServiceClient();
    const resolvedPlan = plan ?? "phase2";
    await db.from("subscriptions").upsert({
      user_id: BYPASS_USER_ID,
      status: "bypass",
      plan: resolvedPlan,
    }, { onConflict: "user_id" });
    const dest = resolvedPlan === "consult" ? "/consult/schedule" : "/dashboard?welcome=true";
    return NextResponse.json({ url: `${origin}${dest}` });
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceDb = createServiceClient();

  // The attorney tier is gated behind manual approval — nothing unlocks
  // checkout for it until an admin approves the signup (app/admin/attorney-signups).
  if (plan === "attorney_pro") {
    const { data: profile } = await serviceDb
      .from("profiles")
      .select("account_type, attorney_user_status")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.account_type !== "attorney_user" || profile?.attorney_user_status !== "approved") {
      return NextResponse.json({ error: "Attorney account not yet approved" }, { status: 403 });
    }
  }

  // A recognized plan (phase2/consult/attorney_pro) with an EMPTY configured
  // price must fail loudly, not silently fall back to phase2's price — that
  // would checkout the caller at the wrong price instead of erroring. Only an
  // unrecognized plan string falls back to phase2 (defensive, matches prior
  // behavior for malformed input).
  const priceId = plan in PLAN_PRICE_IDS ? PLAN_PRICE_IDS[plan] : PHASE2_PRICE_ID;
  if (!priceId) {
    console.error(`[subscriptions/checkout] no Stripe price configured for plan "${plan}"`);
    return NextResponse.json({ error: "Checkout isn't available for this plan yet. Please contact support." }, { status: 500 });
  }
  const mode = plan === "consult" ? "payment" : "subscription";

  // Pre-fill the saved card for returning subscribers (one-click confirm on Stripe)
  const { data: existingSub } = await serviceDb
    .from("subscriptions")
    .select("stripe_customer_id, plan")
    .eq("user_id", user.id)
    .maybeSingle();

  const cancelUrl =
    plan === "consult" && existingSub?.plan === "phase2"
      ? `${origin}/dashboard`
      : plan === "attorney_pro"
        ? `${origin}/onboarding/attorney?step=payment&canceled=true`
        : `${origin}/onboarding?step=payment&canceled=true`;

  const session = await getStripe().checkout.sessions.create({
    mode: mode as "payment" | "subscription",
    ...(existingSub?.stripe_customer_id
      ? { customer: existingSub.stripe_customer_id }
      : { customer_email: user.email }),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/api/subscriptions/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    metadata: { user_id: user.id, plan },
  });

  return NextResponse.json({ url: session.url });
}
