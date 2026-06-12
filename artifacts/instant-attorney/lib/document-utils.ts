import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAttorneyDocumentReady } from "./notify";
import { buildDocReviewPrompt } from "./prompts";
import { WIZARD_LABELS } from "./types";
import type { WizardType, Document, CaseFile, Profile, FactItem, Attachment } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export function isValidWizardType(type: string): type is WizardType {
  return type in WIZARD_LABELS;
}

/** First recommended wizard that maps to a supported WizardType. */
export function pickFirstValidWizard(wizards: string[] | undefined): WizardType | null {
  if (!wizards?.length) return null;
  for (const w of wizards) {
    if (isValidWizardType(w)) return w;
  }
  return null;
}

/** Reuse an in-progress or pre-warmed draft instead of creating a duplicate row. */
export async function findReusableDocument(
  db: SupabaseClient,
  caseFileId: string,
  wizardType: string,
  userId?: string
): Promise<{ id: string } | null> {
  let query = db
    .from("documents")
    .select("id")
    .eq("case_file_id", caseFileId)
    .eq("doc_type", wizardType)
    .in("status", ["pre_warmed", "draft"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data } = await query.maybeSingle();
  return data;
}

/** Mark a document submitted for attorney review and trigger downstream notifications. */
export async function finalizeDocumentSubmission(
  db: SupabaseClient,
  docId: string,
  userId: string
): Promise<Document | null> {
  const { data: existing } = await db
    .from("documents")
    .select("submitted_at")
    .eq("id", docId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.submitted_at) {
    const { data: doc } = await db
      .from("documents")
      .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
      .eq("id", docId)
      .single();
    return (doc as Document) ?? null;
  }

  const now = new Date().toISOString();
  const { data: doc, error } = await db
    .from("documents")
    .update({
      status: "pending_review",
      submitted_at: now,
      updated_at: now,
    })
    .eq("id", docId)
    .eq("user_id", userId)
    .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
    .single();

  if (error || !doc) return null;

  notifyAttorneyDocumentReady(
    doc as Document,
    doc.case_files as CaseFile,
    doc.profiles as Profile
  ).catch((err) => console.error("[document-utils] notify error:", err));

  autoTriggerReview(db, docId, doc as Document & { case_files: CaseFile }).catch(
    (err) => console.error("[document-utils] auto-review error:", err)
  );

  return doc as Document;
}

async function autoTriggerReview(
  db: SupabaseClient,
  docId: string,
  doc: Document & { case_files: CaseFile }
) {
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
