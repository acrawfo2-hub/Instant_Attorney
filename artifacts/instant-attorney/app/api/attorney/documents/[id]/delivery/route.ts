import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyClientDocumentDelivery } from "@/lib/notify";

async function context(id: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: attorney } = await db.from("profiles").select("is_attorney").eq("id", user.id).single();
  if (!attorney?.is_attorney) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const { data: doc } = await db.from("documents").select("*, profiles!documents_user_id_fkey(email, full_name)").eq("id", id).is("parent_document_id", null).single();
  if (!doc) return { error: NextResponse.json({ error: "Document not found" }, { status: 404 }) };
  return { db, user, doc };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(id);
  if (ctx.error) return ctx.error;
  const { data: draft } = await ctx.db.from("document_delivery_drafts").select("*").eq("document_id", id).maybeSingle();
  return NextResponse.json({ draft: draft ? { ...draft, recipient: draft.recipient || ctx.doc.profiles.email } : null });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(id);
  if (ctx.error) return ctx.error;
  const input = await req.json();
  const subject = String(input.subject ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!subject || !body) return NextResponse.json({ error: "Subject and message body are required." }, { status: 400 });
  const { data: draft, error } = await ctx.db.from("document_delivery_drafts").update({
    recipient: ctx.doc.profiles.email,
    subject,
    body,
    consultation_enabled: Boolean(input.consultation_enabled),
    consultation_url: input.consultation_enabled ? String(input.consultation_url ?? "").trim() || null : null,
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  }).eq("document_id", id).select("*").single();
  if (error) return NextResponse.json({ error: "Unable to save message draft." }, { status: 500 });
  return NextResponse.json({ draft });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(id);
  if (ctx.error) return ctx.error;
  const { approveAndSend = false } = await req.json().catch(() => ({}));
  const { data: draft } = await ctx.db.from("document_delivery_drafts").select("*").eq("document_id", id).single();
  if (!draft?.subject.trim() || !draft?.body.trim()) return NextResponse.json({ error: "Save a complete message draft before sending." }, { status: 409 });

  const { data: unresolved } = await ctx.db.from("document_qa_citations").select("id").eq("document_id", id).eq("waived", false).neq("verdict", "verified");
  if (unresolved?.length) return NextResponse.json({ error: "Resolve all outstanding authority warnings before sending." }, { status: 409 });
  if (ctx.doc.status !== "approved" && !approveAndSend) return NextResponse.json({ error: "Approve the revision before sending, or use Approve and send." }, { status: 409 });

  const now = new Date().toISOString();
  if (ctx.doc.status !== "approved") {
    await ctx.db.from("documents").update({ status: "approved", reviewed_by: ctx.user.id, reviewed_at: now, updated_at: now }).in("id", [id, draft.revision_document_id]);
  }
  const consultationUrl = draft.consultation_enabled ? draft.consultation_url : null;
  const fileName = `${ctx.doc.title} - approved.docx`;
  const { data: delivery, error: insertError } = await ctx.db.from("document_deliveries").insert({
    document_id: id, revision_document_id: draft.revision_document_id, case_file_id: ctx.doc.case_file_id,
    user_id: ctx.doc.user_id, sent_by: ctx.user.id, recipient: ctx.doc.profiles.email,
    subject: draft.subject, body: draft.body, consultation_url: consultationUrl, attachment_file_name: fileName, sent_at: now,
  }).select("*").single();
  if (insertError) return NextResponse.json({ error: "Unable to record delivery." }, { status: 500 });

  const historyBody = `${draft.subject}\n\n${draft.body}${consultationUrl ? `\n\nSchedule a consultation: ${consultationUrl}` : ""}\n\nAttachment: ${fileName}`;
  await ctx.db.from("case_messages").insert({ case_file_id: ctx.doc.case_file_id, user_id: ctx.doc.user_id, sender_id: ctx.user.id, sender_role: "attorney", body: historyBody });
  try {
    await notifyClientDocumentDelivery(ctx.doc.profiles.email, { subject: draft.subject, body: draft.body, consultationUrl, revisionDocumentId: draft.revision_document_id, fileName });
  } catch (error) {
    console.error("[delivery] notification error", error);
    return NextResponse.json({ error: "Delivery was recorded but email notification failed.", delivery }, { status: 502 });
  }
  return NextResponse.json({ success: true, delivery });
}
