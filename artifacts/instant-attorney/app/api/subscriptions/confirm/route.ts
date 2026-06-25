import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

/** Replit's internal proxy gives req.nextUrl.origin as localhost:PORT.
 *  Use REPLIT_DOMAINS (the public-facing domain) for post-Stripe redirects. */
function publicOrigin(req: NextRequest): string {
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`;
  }
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const origin = publicOrigin(req);

  if (!sessionId) return NextResponse.redirect(`${origin}/dashboard`);

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan ?? "phase2";

    if (userId && session.payment_status === "paid") {
      const db = createServiceClient();
      await db.from("subscriptions").upsert(
        { user_id: userId, status: "active", plan, current_period_end: null },
        { onConflict: "user_id" }
      );
    }

    const dest = plan === "consult" ? "/consult/schedule" : "/dashboard?welcome=true";
    return NextResponse.redirect(`${origin}${dest}`);
  } catch (e) {
    console.error("[confirm]", e);
    return NextResponse.redirect(`${origin}/dashboard`);
  }
}
