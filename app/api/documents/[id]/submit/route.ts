import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notifyAttorneyDocumentReady } from "@/lib/notify";
import { buildDocReviewPrompt } from "@/lib/prompts";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Document, CaseFile, Profile, FactItem, Attachment } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  // Auto-trigger document review if the attorney has it enabled
  autoTriggerReview(db, id, doc as Document & { case_files: CaseFile }).catch(
    (err) => console.error("[submit] auto-review error:", err)
  );

  return NextResponse.json({ success: true });
}

async function autoTriggerReview(
  db: ReturnType<typeof createServiceClient>,
  docId: string,
  doc: Document & { case_files: CaseFile }
) {
  // Find the attorney for this firm (is_attorney=true accounts)
  const { data: attorneys } = await db
    .from("profiles")
    .select("id, auto_document_review")
    .eq("is_attorney", true)
    .limit(1);

  const attorney = attorneys?.[0];
  if (!attorney?.auto_document_review) return;

  const [{ data: factRows }, { data: attRows }] = await Promise.all([
    db.from("fact_items").select("*").eq("case_file_id", doc.case_file_id),
    db.from("attachments").select("*").eq("case_file_id", doc.case_file_id).eq("status", "ready"),
  ]);

  const prompt = buildDocReviewPrompt(
    doc,
    doc.case_files,
    (factRows ?? []) as FactItem[],
    (attRows ?? []) as Attachment[]
  );

  await db.from("documents").update({
    review_status: "reviewing",
    updated_at: new Date().toISOString(),
  }).eq("id", docId);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const reviewReport = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  await db.from("documents").update({
    review_report: reviewReport,
    review_status: "review_ready",
    updated_at: new Date().toISOString(),
  }).eq("id", docId);
}
