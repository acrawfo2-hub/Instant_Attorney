import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

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

  const { data: profile } = await db.from("profiles").select("is_attorney, auto_document_review").eq("id", userId).single();
  if (!profile?.is_attorney) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  return NextResponse.json({ auto_document_review: profile.auto_document_review ?? true });
}

export async function PATCH(req: NextRequest) {
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
  if (typeof body.auto_document_review !== "boolean") {
    return NextResponse.json({ error: "auto_document_review must be a boolean" }, { status: 400 });
  }

  await db.from("profiles").update({
    auto_document_review: body.auto_document_review,
    updated_at: new Date().toISOString(),
  }).eq("id", userId);

  return NextResponse.json({ auto_document_review: body.auto_document_review });
}
