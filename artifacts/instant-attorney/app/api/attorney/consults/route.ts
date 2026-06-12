import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// List all consults (attorney queue)
export async function GET(_req: NextRequest) {
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

  const { data, error } = await db
    .from("consults")
    .select("*, profiles!consults_user_id_fkey(*), case_files(*)")
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ consults: data ?? [] });
}

// Create a consult
export async function POST(req: NextRequest) {
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
  if (!body.user_id || typeof body.user_id !== "string") {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const insert = {
    user_id: body.user_id,
    case_file_id: body.case_file_id ?? null,
    consult_type: body.consult_type ?? "standard",
    status: body.scheduled_at ? "scheduled" : "needs_scheduling",
    scheduled_at: body.scheduled_at ?? null,
    duration_minutes: body.duration_minutes ?? null,
    location: body.location ?? null,
    notes: body.notes ?? null,
  };

  const { data, error } = await db.from("consults").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ consult: data });
}
