import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notifyAttorneyDocumentReady } from "@/lib/notify";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Document, CaseFile, Profile } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(
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
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const now = new Date().toISOString();
  const { data: doc, error: docErr } = await db
    .from("documents")
    .update({
      status: "pending_review",
      submitted_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  notifyAttorneyDocumentReady(
    doc as Document,
    doc.case_files as CaseFile,
    doc.profiles as Profile
  ).catch((err) => console.error("[submit] notify error:", err));

  return NextResponse.json({ success: true });
}
