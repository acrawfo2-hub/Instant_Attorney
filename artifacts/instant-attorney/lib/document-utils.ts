import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAttorneyDocumentReady } from "./notify.ts";
import { saveDocumentRevision } from "./document-persistence.ts";
import { WIZARD_LABELS, coerceWizardType } from "./types.ts";
import type { WizardType, Document, CaseFile, Profile } from "./types";

export { isValidWizardType } from "./types.ts";

/**
 * Best-effort: record that document `docId` was just generated/regenerated
 * against the file's current facts. Powers the "out of date" flag (a doc is
 * stale when a fact_item changed after this stamp).
 *
 * Deliberately swallows errors: the `facts_synced_at` column may not exist on
 * the live DB yet (manual migration), and a draft must NEVER fail to save just
 * because we couldn't stamp it — staleness simply stays dormant until the
 * column exists. Run separately from the main draft write so the draft persists
 * regardless.
 */
export async function stampFactsSynced(
  db: SupabaseClient,
  docId: string
): Promise<void> {
  try {
    const { error } = await db
      .from("documents")
      .update({ facts_synced_at: new Date().toISOString() })
      .eq("id", docId);
    if (error) {
      console.warn("[document-utils] facts_synced_at stamp skipped:", error.message);
    }
  } catch (err) {
    console.warn("[document-utils] facts_synced_at stamp error:", err);
  }
}

/** First recommended wizard that maps to a supported WizardType. */
export function pickFirstValidWizard(wizards: string[] | undefined): WizardType | null {
  if (!wizards?.length) return null;
  for (const w of wizards) {
    const coerced = coerceWizardType(w);
    if (coerced) return coerced;
  }
  return null;
}

/** Reuse an in-progress or pre-warmed primary draft (never child documents).
 *  When a planKey is given it is the document's stable identity — match on the
 *  dedicated column (rather than mutable JSON metadata)
 *  so two documents sharing the general_document engine stay distinct. Without
 *  a planKey (legacy / typed engines) fall back to matching by doc_type. */
export async function findReusableDocument(
  db: SupabaseClient,
  caseFileId: string,
  wizardType: string,
  userId?: string,
  planKey?: string,
  instrumentKey?: string
): Promise<{ id: string } | null> {
  let query = db
    .from("documents")
    .select("id")
    .eq("case_file_id", caseFileId)
    .is("parent_document_id", null)
    .in("status", ["draft", "changes_requested"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (instrumentKey) {
    query = query.eq("instrument_key", instrumentKey);
  } else if (planKey) {
    query = query.eq("content_json->>plan_key", planKey);
  } else {
    query = query.eq("doc_type", wizardType);
  }

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data } = await query.maybeSingle();
  return data;
}

/** Latest top-level (primary) document for this case + type, in ANY status,
 *  scoped to the owner. Unlike findReusableDocument (which only matches
 *  in-progress drafts), this also returns finalized / in-review documents — used
 *  to avoid inserting a duplicate primary document for a case that already has
 *  one. Returns enough to drive an in-place, status-preserving update. */
export async function findPrimaryDocument(
  db: SupabaseClient,
  caseFileId: string,
  wizardType: string,
  userId?: string,
  planKey?: string,
  instrumentKey?: string
): Promise<{ id: string; status: string | null; content_json: unknown; draft_text: string | null } | null> {
  let query = db
    .from("documents")
    .select("id, status, content_json, draft_text")
    .eq("case_file_id", caseFileId)
    .is("parent_document_id", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (instrumentKey) {
    query = query.eq("instrument_key", instrumentKey);
  } else if (planKey) {
    query = query.eq("content_json->>plan_key", planKey);
  } else {
    query = query.eq("doc_type", wizardType);
  }

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data } = await query.maybeSingle();
  return data ?? null;
}

/** Result of resolving which document a fresh wizard generation should write to. */
export type WizardDocumentTarget =
  | {
      action: "update";
      documentId: string;
      existing: { status: string | null; content_json: unknown };
    }
  | { action: "insert" }
  | {
      action: "already_finalized";
      document: { id: string; status: string | null; content_json: unknown; draft_text: string | null };
    };

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
  return children
    .filter((d) => d.doc_type === "second_draft")
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0] ?? null;
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

/**
 * Replace any existing second-draft child with a new standalone document row.
 *
 * This owns the `saveDocumentRevision` call rather than leaving it to callers:
 * the second draft is document text, so it must be stamped with a revision and
 * synchronized to the Living File, and a helper that writes the text but leaves
 * the boundary to whoever calls it is exactly the split that let earlier writes
 * escape it. Both callers get the stamp for free.
 */
export async function upsertSecondDraftChild(
  db: SupabaseClient,
  parent: Document,
  draftText: string,
  // Attorney-only changelog of what changed from the first draft. Stored in
  // content_json (never rendered into the client-facing document) so the review
  // page can show it alongside the revised draft.
  changes?: string | null
): Promise<{ document: Document; syncPending: boolean } | null> {
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
      content_json: changes ? { changes } : {},
    })
    .select("*")
    .single();

  if (error) {
    console.error("[document-utils] second draft child insert error:", error);
    return null;
  }

  const document = data as Document;

  await db.from("documents").update({
    improved_draft_text: draftText,
    updated_at: new Date().toISOString(),
  }).eq("id", parent.id);

  // The row already exists, so `persist` is a pass-through: the boundary is
  // here for the revision id and the Living File sync, not for the insert.
  const { syncPending } = await saveDocumentRevision(db, {
    caseFileId: parent.case_file_id,
    userId: parent.user_id,
    draftText,
    persist: async () => document.id,
  });

  return { document, syncPending };
}

/** Mark a primary draft submitted for attorney review and trigger downstream notifications. */
export async function finalizeDocumentSubmission(
  db: SupabaseClient,
  docId: string,
  userId: string
): Promise<Document | null> {
  // Attorney-user documents never enter Andrew Crawford's review queue — an
  // attorney-user is the reviewing attorney for their own client's matter, so
  // there is no one to submit to. Belt-and-suspenders: the wizard UI never
  // calls this for attorney-user accounts, but reject here too in case
  // something calls this path directly.
  const { data: profile } = await db
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.account_type === "attorney_user") {
    return null;
  }

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

  // Stage 48 pins every QA record to an immutable revision, and its
  // pin_qa_to_revision trigger raises when a document has none. The migration
  // backfills a client_submitted revision for documents that existed when it
  // ran, but nothing created one afterwards — so a document submitted after the
  // migration would have had its review run rejected at insert. Record the
  // submitted baseline here, on the one path every submission goes through.
  //
  // Guarded so a resubmission does not stack duplicate baselines, and
  // best-effort: a failure here must not block the submission itself.
  const { data: baseline } = await db
    .from("document_revisions")
    .select("id")
    .eq("document_id", docId)
    .eq("source_action", "client_submitted")
    .limit(1)
    .maybeSingle();
  if (!baseline) {
    const { error: revisionError } = await db.from("document_revisions").insert({
      document_id: docId,
      content: (doc as Document).draft_text ?? "",
      title: (doc as Document).title,
      author_type: "client",
      source_action: "client_submitted",
      summary: "Client-submitted original",
    });
    if (revisionError) {
      console.error("[document-utils] baseline revision error:", revisionError.message);
    }
  }

  notifyAttorneyDocumentReady(
    doc as Document,
    doc.case_files as CaseFile,
    doc.profiles as Profile
  ).catch((err) => console.error("[document-utils] notify error:", err));

  // Auto-kick off the orchestrator review run (fire-and-forget). Dynamic import
  // avoids a static import cycle — attorney-review imports the upsert*Child
  // helpers from this module. The run guards against double-starts itself.
  import("@/lib/attorney-review")
    .then(({ startDocumentReview }) => startDocumentReview(docId, doc.case_file_id))
    .catch((err) => console.error("[document-utils] review kickoff error:", err));

  return doc as Document;
}
