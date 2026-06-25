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
