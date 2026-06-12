import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notifyClientConsultConfirmed } from "@/lib/notify";
import { BYPASS_USER_ID } from "@/lib/types";
import type { ConsultRequest, Profile } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let userId: string;

  if (BYPASS_AUTH) {
    db = createServiceClient();
    userId = BYPASS_USER_ID;
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    // Attorney-only
    const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
    if (!profile?.is_attorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { action, time } = await req.json();

  let update: Record<string, unknown>;
  if (action === "confirm") {
    if (!time) return NextResponse.json({ error: "time required for confirm" }, { status: 400 });
    update = { status: "confirmed", confirmed_time: time, updated_at: new Date().toISOString() };
  } else if (action === "propose") {
    if (!time) return NextResponse.json({ error: "time required for propose" }, { status: 400 });
    update = { status: "attorney_proposed", attorney_proposed_time: time, updated_at: new Date().toISOString() };
  } else if (action === "cancel") {
    update = { status: "cancelled", updated_at: new Date().toISOString() };
  } else if (action === "complete") {
    update = { status: "completed", updated_at: new Date().toISOString() };
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await db
    .from("consult_requests")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Notify client on confirm or propose
  if (action === "confirm" || action === "propose") {
    try {
      const consult = updated as ConsultRequest;
      const { data: profile } = await db.from("profiles").select("*").eq("id", consult.user_id).single();
      await notifyClientConsultConfirmed(consult, profile as Profile);
    } catch (e) {
      console.error("[consult] notify error", e);
    }
  }

  return NextResponse.json(updated);
}
