import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAttorneyDocumentReady } from "./notify";
import { DOC_REVIEW_SYSTEM_PROMPT, buildDocReviewUserMessage } from "./prompts";
import { WIZARD_LABELS } from "./types";
import type { WizardType, Document, CaseFile, Profile, FactItem, Attachment } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney });

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

/** Reuse an in-progress or pre-warmed primary draft (never child documents). */
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
    .is("parent_document_id", null)
    .in("status", ["pre_warmed", "draft", "changes_requested"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data } = await query.maybeSingle();
  return data;
}

export async function getChildDocuments(
  db: SupabaseClient,
  parentId: string
): Promise<Document[]> {
  const { data } = await db
    .from("documents")
    .select("*")
    .eq("parent_document_id", parentId)
    .order("created_at", { ascending: true });

  return (data ?? []) as Document[];
}

export function getCriticalReviewChild(children: Document[]): Document | null {
  return children.find((d) => d.doc_type === "critical_review") ?? null;
}

export function getSecondDraftChild(children: Document[]): Document | null {
  return children.find((d) => d.doc_type === "second_draft") ?? null;
}

/** Replace any existing critical-review child with a new standalone document row. */
export async function upsertCriticalReviewChild(
  db: SupabaseClient,
  parent: Document,
  reviewReport: string
): Promise<Document | null> {
  await db
    .from("documents")
    .delete()
    .eq("parent_document_id", parent.id)
    .eq("doc_type", "critical_review");

  const { data, error } = await db
    .from("documents")
    .insert({
      case_file_id: parent.case_file_id,
      user_id: parent.user_id,
      parent_document_id: parent.id,
      doc_type: "critical_review",
      title: `${parent.title} — Critical Review`,
      status: "draft",
      draft_text: reviewReport,
      content_json: {},
    })
    .select("*")
    .single();

  if (error) {
    console.error("[document-utils] critical review child insert error:", error);
    return null;
  }

  // Keep parent review_report in sync for legacy readers
  await db.from("documents").update({
    review_report: reviewReport,
    updated_at: new Date().toISOString(),
  }).eq("id", parent.id);

  return data as Document;
}

/** Replace any existing second-draft child with a new standalone document row. */
export async function upsertSecondDraftChild(
  db: SupabaseClient,
  parent: Document,
  draftText: string
): Promise<Document | null> {
  await db
    .from("documents")
    .delete()
    .eq("parent_document_id", parent.id)
    .eq("doc_type", "second_draft");

  const { data, error } = await db
    .from("documents")
    .insert({
      case_file_id: parent.case_file_id,
      user_id: parent.user_id,
      parent_document_id: parent.id,
      doc_type: "second_draft",
      title: `${parent.title} — Revised Draft`,
      status: "draft",
      draft_text: draftText,
      content_json: {},
    })
    .select("*")
    .single();

  if (error) {
    console.error("[document-utils] second draft child insert error:", error);
    return null;
  }

  await db.from("documents").update({
    improved_draft_text: draftText,
    updated_at: new Date().toISOString(),
  }).eq("id", parent.id);

  return data as Document;
}

/** Mark a primary draft submitted for attorney review and trigger downstream notifications. */
export async function finalizeDocumentSubmission(
  db: SupabaseClient,
  docId: string,
  userId: string
): Promise<Document | null> {
  const { data: existing } = await db
    .from("documents")
    .select("id, status, submitted_at, parent_document_id")
    .eq("id", docId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing || existing.parent_document_id) {
    return null;
  }

  const isResubmit = existing.status === "changes_requested";
  const alreadyQueued =
    existing.status === "pending_review" && !!existing.submitted_at;

  if (alreadyQueued && !isResubmit) {
    const { data: doc } = await db
      .from("documents")
      .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
      .eq("id", docId)
      .single();
    return (doc as Document) ?? null;
  }

  const now = new Date().toISOString();

  if (isResubmit) {
    await db
      .from("documents")
      .delete()
      .eq("parent_document_id", docId)
      .in("doc_type", ["critical_review", "second_draft"]);
  }

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
    .order("created_at", { ascending: true });

  const attorney = attorneys?.find((a) => a.auto_document_review) ?? attorneys?.[0];
  if (!attorney?.auto_document_review) return;

  const [{ data: factRows }, { data: attRows }] = await Promise.all([
    db.from("fact_items").select("*").eq("case_file_id", doc.case_file_id),
    db.from("attachments").select("*").eq("case_file_id", doc.case_file_id).eq("status", "ready"),
  ]);

  const userMessage = buildDocReviewUserMessage(
    doc,
    doc.case_files,
    (factRows ?? []) as FactItem[],
    (attRows ?? []) as Attachment[]
  );

  await db.from("documents").update({
    review_status: "reviewing",
    updated_at: new Date().toISOString(),
  }).eq("id", docId);

  try {
    const batch = await anthropic.messages.batches.create({
      requests: [
        {
          custom_id: docId,
          params: {
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            system: [
              {
                type: "text" as const,
                text: DOC_REVIEW_SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" as const },
              },
            ],
            messages: [{ role: "user" as const, content: userMessage }],
          },
        },
      ],
    });

    // Store batch ID in the document's content_json for the poll handler to pick up
    const { data: current } = await db
      .from("documents")
      .select("content_json")
      .eq("id", docId)
      .single();

    await db.from("documents").update({
      content_json: { ...(current?.content_json ?? {}), review_batch_job_id: batch.id },
      updated_at: new Date().toISOString(),
    }).eq("id", docId);

    console.log(`[auto-review] Batch submitted for doc ${docId} (batch: ${batch.id})`);
  } catch (err) {
    console.error("[document-utils] auto-review batch error:", err);
    await db.from("documents").update({
      review_status: null,
      updated_at: new Date().toISOString(),
    }).eq("id", docId);
  }
}
