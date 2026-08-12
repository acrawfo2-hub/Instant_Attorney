import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateDocxFromText, docxContentDisposition, isAttorneyApproved, profileForDocumentType } from "@/lib/doc-generator";
import { recordDocumentDelivery } from "@/lib/document-delivery";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function GET(
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

  const { data: profile } = BYPASS_AUTH
    ? { data: { is_attorney: false } }
    : await db.from("profiles").select("is_attorney").eq("id", userId).single();

  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only the owning client or an attorney can download
  if (doc.user_id !== userId && !profile?.is_attorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if ((doc.content_json as Record<string, unknown> | null)?.generation_incomplete === true) {
    return NextResponse.json(
      { error: "This generation is incomplete. Regenerate or have an attorney repair and accept it before downloading." },
      { status: 409 }
    );
  }

  // Every renderable doc type keeps its text in draft_text (the critical-review
  // and second-draft children do too); fall back to the legacy columns just in
  // case an older row only populated those.
  const text = doc.draft_text || doc.review_report || doc.improved_draft_text;
  if (!text) {
    return NextResponse.json({ error: "No draft text available" }, { status: 404 });
  }

  // Fetch the case file with the service client rather than an RLS-scoped join.
  // An attorney downloading a client's document gets the document row but a NULL
  // embedded case_files under RLS — which used to crash the docx builder. This
  // path is already authorized above, so a service-role read is safe.
  const serviceDb = createServiceClient();
  const [{ data: caseFile }, { data: ownerProfile }] = await Promise.all([
    serviceDb.from("case_files").select("matter_subtype, jurisdiction").eq("id", doc.case_file_id).maybeSingle(),
    // The DOCUMENT OWNER's persona (not necessarily the requester's — an
    // attorney reviewing someone else's document has their own account_type)
    // decides whether the "not reviewed by an attorney" watermark applies.
    serviceDb.from("profiles").select("account_type").eq("id", doc.user_id).maybeSingle(),
  ]);
  const isAttorneyUserDoc = ownerProfile?.account_type === "attorney_user";

  let buffer: Buffer;
  try {
    // Pass the document status so the renderer watermarks pre-review drafts and
    // drops the watermark once an attorney has approved the document (AI
    // Philosophy §4.2, Terms §7). A child (critical_review/second_draft) carries
    // its own status, set to "approved" alongside its parent on approval.
    buffer = await generateDocxFromText(doc.title, text, profileForDocumentType(doc.doc_type), (caseFile as CaseFile) ?? null, doc.status, isAttorneyUserDoc);
  } catch (err) {
    console.error("[documents/download] docx generation error:", err);
    return NextResponse.json({ error: "Could not build the document file" }, { status: 500 });
  }

  // Record what we delivered: an immutable audit row + byte-for-byte snapshot of
  // the exact .docx, with the review/watermark state at this moment. Best-effort —
  // a logging hiccup never blocks the client's download.
  await recordDocumentDelivery({
    serviceDb,
    document: doc,
    buffer,
    watermarked: !isAttorneyApproved(doc.status) && !isAttorneyUserDoc,
    downloadedBy: userId,
    downloadedByIsAttorney: Boolean(profile?.is_attorney),
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": docxContentDisposition(doc.title),
    },
  });
}
