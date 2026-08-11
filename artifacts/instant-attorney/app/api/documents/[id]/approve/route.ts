import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getChildDocuments } from "@/lib/document-utils";
import { notifyClientDocumentApproved } from "@/lib/notify";
import { docTypeLabel } from "@/lib/types";
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

  const { data: profile } = await db
    .from("profiles")
    .select("is_attorney")
    .eq("id", user.id)
    .single();

  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Approval/request-changes is publication of review output. Bind it to the
  // exact revision reviewed so an in-flight client answer wins the race.
  const [{ data: sourceDoc }, { data: reviewRun }] = await Promise.all([
    db.from("documents").select("revision_number").eq("id", id).is("parent_document_id", null).single(),
    db.from("document_review_runs").select("id, status, source_revision").eq("document_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (reviewRun && (
    reviewRun.status === "stale" ||
    (reviewRun.source_revision ?? 1) !== (sourceDoc?.revision_number ?? 1)
  )) {
    return NextResponse.json(
      { error: "The client submitted a newer revision. Review it before publishing a decision.", review_state: "stale" },
      { status: 409 },
    );
  }

  const children = await getChildDocuments(db, id);
  const secondDraft = children.find((c) => c.doc_type === "second_draft");

  if (action === "approve" && secondDraft && !secondDraft.draft_text) {
    return NextResponse.json(
      { error: "A revised draft record exists but has no content yet." },
      { status: 400 }
    );
  }

  // Authorities gate (schema-stage45): a mis-identified case must never reach the
  // client. Block approval while any citation on this document is unverified,
  // unsupported, or errored and has not been explicitly waived by the attorney.
  if (action === "approve") {
    const { data: unresolved } = await db
      .from("document_qa_citations")
      .select("id, raw, verdict")
      .eq("document_id", id)
      .eq("waived", false)
      .neq("verdict", "verified");
    if (unresolved && unresolved.length > 0) {
      return NextResponse.json(
        {
          error: `${unresolved.length} citation${unresolved.length === 1 ? "" : "s"} could not be verified. Verify, remove, or waive each one before approving.`,
          unresolvedCitations: unresolved,
        },
        { status: 409 }
      );
    }
  }

  const newStatus = action === "approve" ? "approved" : "changes_requested";
  const now = new Date().toISOString();

  const { data: doc, error: updateErr } = await db
    .from("documents")
    .update({
      status: newStatus,
      attorney_notes: attorney_notes ?? null,
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("revision_number", sourceDoc?.revision_number ?? 1)
    .is("parent_document_id", null)
    .select("*, profiles!documents_user_id_fkey(*)")
    .single();

  if (updateErr || !doc) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  if (action === "approve" && secondDraft) {
    await db.from("documents").update({
      status: "approved",
      updated_at: now,
    }).eq("id", secondDraft.id);
  }

  if (action === "approve" && doc.profiles) {
    const notifyDoc = {
      ...(doc as Document),
      title: secondDraft
        ? `${docTypeLabel(doc.doc_type)} (Revised)`
        : doc.title,
    };
    notifyClientDocumentApproved(notifyDoc, doc.profiles as Profile).catch(
      (err) => console.error("[approve] notify error:", err)
    );
  }

  return NextResponse.json({
    success: true,
    status: newStatus,
    approved_document_id: secondDraft?.id ?? doc.id,
  });
}
