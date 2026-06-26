import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getAppUrl } from "@/lib/app-url";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const origin = getAppUrl(req.nextUrl.origin);

  if (!sessionId) return NextResponse.redirect(`${origin}/dashboard`);

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan ?? "phase2";

    if (userId && session.payment_status === "paid") {
      const db = createServiceClient();

      if (plan === "consult") {
        // Phase 2 users buying a consult add-on must not have their plan overwritten.
        const { data: existing } = await db
          .from("subscriptions")
          .select("plan, consult_credits")
          .eq("user_id", userId)
          .maybeSingle();

        if (existing?.plan === "phase2") {
          await db
            .from("subscriptions")
            .update({
              consult_credits: (existing.consult_credits ?? 0) + 1,
              stripe_customer_id: session.customer as string,
            })
            .eq("user_id", userId);
        } else {
          await db.from("subscriptions").upsert(
            { user_id: userId, status: "active", plan, current_period_end: null },
            { onConflict: "user_id" }
          );
        }
      } else {
        await db.from("subscriptions").upsert(
          { user_id: userId, status: "active", plan, current_period_end: null },
          { onConflict: "user_id" }
        );
      }
    }

    const dest = plan === "consult" ? "/consult/schedule" : "/dashboard?welcome=true";
    return NextResponse.redirect(`${origin}${dest}`);
  } catch (e) {
    console.error("[confirm]", e);
    return NextResponse.redirect(`${origin}/dashboard`);
  }
}
