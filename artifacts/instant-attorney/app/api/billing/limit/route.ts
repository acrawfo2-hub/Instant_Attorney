import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setMonthlyLimit } from "@/lib/topup";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/**
 * Set the customer's pre-approved monthly top-up cap. Raising it past what's
 * already owed clears a 'limit_reached' pause and re-fires the pending top-up.
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({}));
  const limitUsd = Number(body?.limit_usd);
  if (!Number.isFinite(limitUsd) || limitUsd < 0) {
    return NextResponse.json({ error: "limit_usd must be a non-negative number" }, { status: 400 });
  }

  const summary = await setMonthlyLimit(userId, limitUsd);
  return NextResponse.json(summary);
}
