import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, PHASE2_PRICE_ID, CONSULT_PRICE_ID } from "@/lib/stripe";
import { BYPASS_USER_ID } from "@/lib/types";
import { getAppUrl } from "@/lib/app-url";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { plan } = await req.json();
  const origin = getAppUrl(req.nextUrl.origin);

  // BYPASS: skip Stripe entirely, provision subscription directly
  if (BYPASS_AUTH) {
    const db = createServiceClient();
    await db.from("subscriptions").upsert({
      user_id: BYPASS_USER_ID,
      status: "bypass",
      plan: plan ?? "phase2",
    }, { onConflict: "user_id" });
    return NextResponse.json({ url: `${origin}/dashboard?welcome=true` });
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const priceId = plan === "consult" ? CONSULT_PRICE_ID : PHASE2_PRICE_ID;
  const mode = plan === "consult" ? "payment" : "subscription";

  // Pre-fill the saved card for returning subscribers (one-click confirm on Stripe)
  const serviceDb = createServiceClient();
  const { data: existingSub } = await serviceDb
    .from("subscriptions")
    .select("stripe_customer_id, plan")
    .eq("user_id", user.id)
    .maybeSingle();

  const cancelUrl =
    plan === "consult" && existingSub?.plan === "phase2"
      ? `${origin}/dashboard`
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
