import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyClientDocumentApproved } from "@/lib/notify";
import type { Document, Profile } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, attorney_notes } = await req.json();

  if (!action || !["approve", "request_changes"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify attorney
  const { data: profile } = await db
    .from("profiles")
    .select("is_attorney")
    .eq("id", user.id)
    .single();

  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const newStatus = action === "approve" ? "approved" : "changes_requested";

  const { data: doc, error: updateErr } = await db
    .from("documents")
    .update({
      status: newStatus,
      attorney_notes: attorney_notes ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*, profiles!documents_user_id_fkey(*)")
    .single();

  if (updateErr || !doc) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Notify client if approved
  if (action === "approve" && doc.profiles) {
    notifyClientDocumentApproved(doc as Document, doc.profiles as Profile).catch(
      (err) => console.error("[approve] notify error:", err)
    );
  }

  return NextResponse.json({ success: true, status: newStatus });
}
