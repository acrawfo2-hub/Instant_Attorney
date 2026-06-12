import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { ConsultStatus } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const VALID_STATUS: ConsultStatus[] = ["needs_scheduling", "scheduled", "completed", "canceled"];

// Update a consult — schedule it, change status, edit details
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  if (!profile?.is_attorney) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const body = await req.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("scheduled_at" in body) {
    update.scheduled_at = body.scheduled_at || null;
    // Scheduling a consult moves it onto the pending schedule automatically.
    if (body.scheduled_at && !body.status) update.status = "scheduled";
  }
  if ("status" in body) {
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }
  if ("duration_minutes" in body) update.duration_minutes = body.duration_minutes ?? null;
  if ("location" in body) update.location = body.location ?? null;
  if ("notes" in body) update.notes = body.notes ?? null;
  if ("consult_type" in body) update.consult_type = body.consult_type;

  const { data, error } = await db.from("consults").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ consult: data });
}

// Delete a consult
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  if (!profile?.is_attorney) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const { error } = await db.from("consults").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
