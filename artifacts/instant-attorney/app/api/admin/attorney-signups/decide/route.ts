import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";

/** Attorney-only approve/reject for a pending attorney-user signup. */
export async function POST(req: NextRequest) {
  const attorneyId = await getAttorneyUserId();
  if (!attorneyId) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : null;
  const decision = body?.decision === "approved" || body?.decision === "rejected" ? body.decision : null;

  if (!userId || !decision) {
    return NextResponse.json({ error: "Provide userId and decision ('approved' | 'rejected')" }, { status: 400 });
  }

  const serviceDb = createServiceClient();
  const { error } = await serviceDb
    .from("profiles")
    .update({ attorney_user_status: decision })
    .eq("id", userId)
    .eq("account_type", "attorney_user");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, userId, decision });
}
