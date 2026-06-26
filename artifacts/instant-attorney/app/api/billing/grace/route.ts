import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setGraceOptIn } from "@/lib/topup";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/**
 * Toggle opt-in completion grace ("finish my documents, charge later"). When on,
 * a blocked ledger still serves AI up to the bounded grace buffer so an in-flight
 * document can finish; the overshoot is collected on the next successful top-up.
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
  if (typeof body?.opt_in !== "boolean") {
    return NextResponse.json({ error: "opt_in must be a boolean" }, { status: 400 });
  }

  const summary = await setGraceOptIn(userId, body.opt_in);
  return NextResponse.json(summary);
}
