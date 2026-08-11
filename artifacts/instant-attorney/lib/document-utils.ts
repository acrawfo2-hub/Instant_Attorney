import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAttorneyDocumentReady } from "./notify.ts";
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
  planKey?: string
): Promise<{ id: string } | null> {
  let query = db
    .from("documents")
    .select("id")
    .eq("case_file_id", caseFileId)
    .is("parent_document_id", null)
    .in("status", ["draft", "changes_requested"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (planKey) {
    query = query.eq("instrument_key", planKey);
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
  planKey?: string
): Promise<{ id: string; status: string | null; content_json: unknown; draft_text: string | null } | null> {
  let query = db
    .from("documents")
    .select("id, status, content_json, draft_text")
    .eq("case_file_id", caseFileId)
    .is("parent_document_id", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (planKey) {
    query = query.eq("instrument_key", planKey);
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

/**
 * Decide which document a fresh wizard draft should land on, enforcing the
 * selection precedence the wizard route relies on:
 *   1. a caller-supplied documentId — but ONLY if it belongs to this caller
 *      (same user_id + case_file_id), else it's dropped to prevent IDOR;
 *   2. otherwise, a reusable in-progress primary draft for this case + type;
 *   3. otherwise, the case's latest primary document of this type in ANY status:
 *      - if it's still editable (draft / changes_requested / pre_warmed / null),
 *        update it in place (never insert a duplicate primary);
 *      - if it's already finalized / in review, neither insert nor overwrite —
 *        signal "already_finalized" so the caller returns the existing document;
 *   4. otherwise, insert a brand-new document.
 *
 * Note: a reusable draft is only looked up when NO documentId was supplied — a
 * supplied-but-foreign id is dropped straight to the primary-document fallback,
 * matching the route's original control flow exactly. `db` must be the same
 * client the route uses for these reads/writes (the service client).
 */
export async function resolveWizardDocumentTarget(
  db: SupabaseClient,
  params: {
    caseFileId: string;
    wizardType: string;
    userId: string;
    suppliedDocumentId?: string;
    planKey?: string;
  }
): Promise<WizardDocumentTarget> {
  const { caseFileId, wizardType, userId, suppliedDocumentId, planKey } = params;
  let savedDocId: string | undefined = suppliedDocumentId;

  if (!savedDocId) {
    const reusable = await findReusableDocument(db, caseFileId, wizardType, userId, planKey);
    savedDocId = reusable?.id;
  }

  // Ownership check. `db` (service client) bypasses RLS, so any candidate id —
  // including a caller-supplied one — must be scoped to this caller. A foreign or
  // stale id returns nothing and is dropped, falling through to the fallback.
  let existingDoc: { status: string | null; content_json: unknown } | null = null;
  if (savedDocId) {
    const { data } = await db
      .from("documents")
      .select("status, content_json")
      .eq("id", savedDocId)
      .eq("user_id", userId)
      .eq("case_file_id", caseFileId)
      .maybeSingle();
    existingDoc = (data as { status: string | null; content_json: unknown } | null) ?? null;
    if (!existingDoc) savedDocId = undefined;
  }

  if (!savedDocId) {
    const primary = await findPrimaryDocument(db, caseFileId, wizardType, userId, planKey);
    if (primary) {
      const isEditable =
        primary.status === "draft" ||
        primary.status === "changes_requested" ||
        primary.status === "pre_warmed" ||
        primary.status == null;
      if (isEditable) {
        return {
          action: "update",
          documentId: primary.id,
          existing: { status: primary.status, content_json: primary.content_json },
        };
      }
      return { action: "already_finalized", document: primary };
    }
  }

  if (savedDocId && existingDoc) {
    return { action: "update", documentId: savedDocId, existing: existingDoc };
  }
  return { action: "insert" };
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
  draftText: string,
  // Attorney-only changelog of what changed from the first draft. Stored in
  // content_json (never rendered into the client-facing document) so the review
  // page can show it alongside the revised draft.
  changes?: string | null
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
      content_json: changes ? { changes } : {},
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
