import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/**
 * Open a Stripe Billing Portal session so the customer can update the card used
 * for automatic top-ups — the graceful "fix it before it fails" path.
 */
export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  let userId: string;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const serviceDb = createServiceClient();
  const { data: sub } = await serviceDb
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account on file" }, { status: 400 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
