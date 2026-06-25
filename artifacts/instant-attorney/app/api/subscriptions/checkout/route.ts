import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe, PHASE2_PRICE_ID, CONSULT_PRICE_ID } from "@/lib/stripe";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/** Replit's internal proxy gives req.nextUrl.origin as localhost:PORT.
 *  Use REPLIT_DOMAINS (the public-facing domain) for Stripe redirect URLs. */
function publicOrigin(req: NextRequest): string {
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`;
  }
  return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  const { plan } = await req.json();
  const origin = publicOrigin(req);

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

  const session = await getStripe().checkout.sessions.create({
    mode,
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/api/subscriptions/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/onboarding?step=payment&canceled=true`,
    metadata: { user_id: user.id, plan },
  });

  return NextResponse.json({ url: session.url });
}
