import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notifyClientConsultConfirmed } from "@/lib/notify";
import { generatePreConsultMemo } from "@/lib/pre-consult-generate";
import { BYPASS_USER_ID } from "@/lib/types";
import type { ConsultRequest, Profile } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

const ATTORNEY_ACTIONS = new Set(["confirm", "propose", "cancel", "complete"]);
const CLIENT_ACTIONS = new Set(["accept", "decline"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let userId: string;
  let isAttorney = BYPASS_AUTH;

  if (BYPASS_AUTH) {
    db = createServiceClient();
    userId = BYPASS_USER_ID;
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
    isAttorney = profile?.is_attorney ?? false;
  }

  const { data: existing, error: fetchErr } = await db
    .from("consult_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Consult request not found" }, { status: 404 });
  }

  const consult = existing as ConsultRequest;
  const { action, time } = await req.json();

  if (isAttorney) {
    if (!ATTORNEY_ACTIONS.has(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } else {
    if (consult.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!CLIENT_ACTIONS.has(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  }

  let update: Record<string, unknown>;

  if (action === "confirm") {
    if (!time) return NextResponse.json({ error: "time required for confirm" }, { status: 400 });
    if (!consult.proposed_times.includes(time)) {
      return NextResponse.json({ error: "Time must be one of the client's proposed slots" }, { status: 400 });
    }
    update = { status: "confirmed", confirmed_time: time, updated_at: new Date().toISOString() };
  } else if (action === "propose") {
    if (!time) return NextResponse.json({ error: "time required for propose" }, { status: 400 });
    update = { status: "attorney_proposed", attorney_proposed_time: time, updated_at: new Date().toISOString() };
  } else if (action === "accept") {
    if (consult.status !== "attorney_proposed" || !consult.attorney_proposed_time) {
      return NextResponse.json({ error: "No proposed time to accept" }, { status: 400 });
    }
    update = {
      status: "confirmed",
      confirmed_time: consult.attorney_proposed_time,
      updated_at: new Date().toISOString(),
    };
  } else if (action === "decline") {
    if (consult.status !== "attorney_proposed") {
      return NextResponse.json({ error: "No proposed time to decline" }, { status: 400 });
    }
    update = {
      status: "cancelled",
      attorney_proposed_time: null,
      updated_at: new Date().toISOString(),
    };
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

  if (isAttorney && (action === "confirm" || action === "propose")) {
    try {
      const result = updated as ConsultRequest;
      const { data: clientProfile } = await db.from("profiles").select("*").eq("id", result.user_id).single();
      await notifyClientConsultConfirmed(result, clientProfile as Profile);
    } catch (e) {
      console.error("[consult] notify error", e);
    }
  }

  if ((action === "confirm" || action === "accept") && (updated as ConsultRequest).case_file_id) {
    const result = updated as ConsultRequest;
    const serviceDb = createServiceClient();
    void generatePreConsultMemo(serviceDb, result.case_file_id!, userId).catch((e) => {
      console.error("[consult] pre-consult brief generation error", e);
    });
  }

  return NextResponse.json(updated);
}
