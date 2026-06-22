import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { settleTopUpFromIntent, failTopUpFromIntent } from "@/lib/topup";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = createServiceClient();

  // Idempotency: record the event id first. A duplicate delivery hits the
  // primary-key conflict and is acknowledged without re-running side effects.
  const { error: dedupeErr } = await db
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type });
  if (dedupeErr) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const plan = session.metadata?.plan ?? "phase2";
      if (!userId) break;

      await db.from("subscriptions").upsert({
        user_id: userId,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string | null,
        status: "active",
        plan,
        current_period_end: session.subscription
          ? null  // filled in by subscription.updated event
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "user_id" });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;
      await db
        .from("subscriptions")
        .update({
          status: sub.status as string,
          current_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id);
      break;
    }

    // ── Token top-up outcomes (authoritative reset / block) ──────────────────
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata?.type === "token_topup") {
        await settleTopUpFromIntent(db, intent);
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata?.type === "token_topup") {
        await failTopUpFromIntent(db, intent);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
