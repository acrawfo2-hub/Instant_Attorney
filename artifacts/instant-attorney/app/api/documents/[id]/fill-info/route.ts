import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { applyPlaceholderAnswers, extractPlaceholders, placeholderFields } from "@/lib/wizard-parsing";
import { syncDraftGapsToLivingFile } from "@/lib/file-parser";
import { BYPASS_USER_ID } from "@/lib/types";
import { placeholderFillLifecycle } from "@/lib/document-revisions";
import { startDocumentReview } from "@/lib/attorney-review";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Fill [[placeholders]] in a document's draft with client-supplied values.
// Deterministic text substitution only — no model call, and no character of the
// document changes except the named blanks, so an attorney-approved draft stays
// intact. `answers` is keyed by each placeholder's normalized full text.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const answers = body?.answers;
  if (!answers || typeof answers !== "object") {
    return NextResponse.json({ error: "answers required" }, { status: 400 });
  }

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
    .select("id, user_id, case_file_id, parent_document_id, draft_text, status, revision_number, approved_revision, review_status")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (doc.user_id !== userId && !profile?.is_attorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!doc.draft_text) {
    return NextResponse.json({ error: "No draft text to fill" }, { status: 400 });
  }

  // Only accept string answers; ignore anything else the client might send.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) clean[k] = v.trim();
  }

  const { text, filled } = applyPlaceholderAnswers(doc.draft_text, clean);

  if (filled === 0) {
    return NextResponse.json({ filled: 0, remaining: extractPlaceholders(text).length, draft_text: doc.draft_text });
  }

  const writeDb = BYPASS_AUTH ? db : createServiceClient();
  // Load the complete lifecycle context before writing. In particular, review
  // runs and derived drafts are needed to make this decision against the exact
  // version the attorney may currently be reading.
  const primaryId = doc.parent_document_id ?? doc.id;
  const [{ data: primary }, { data: revised }, { data: activeRun }, { count: revisionCount }] = await Promise.all([
    writeDb.from("documents").select("id, status, revision_number, approved_revision, review_status").eq("id", primaryId).single(),
    writeDb.from("documents").select("id, updated_at").eq("parent_document_id", primaryId).eq("doc_type", "second_draft").maybeSingle(),
    writeDb.from("document_review_runs").select("id, status, source_revision").eq("document_id", primaryId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // Stage 48 replaced document_revisions' linear revision_number with a
    // provenance/branching shape, so the old max(revision_number) fallback no
    // longer exists. The count answers the same question — how many revisions
    // this document already has — and documents.revision_number remains the
    // authoritative optimistic-lock counter regardless.
    writeDb.from("document_revisions").select("id", { count: "exact", head: true }).eq("document_id", primaryId),
  ]);
  if (!primary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lifecycle = placeholderFillLifecycle(primary.status);
  const expectedRevision = primary.revision_number ?? revisionCount ?? 1;
  const { data: applied, error: updErr } = await writeDb.rpc("apply_document_placeholder_revision", {
    p_document_id: primaryId,
    p_expected_revision: expectedRevision,
    p_text: text,
    p_actor: userId,
  });

  if (updErr) {
    const conflict = updErr.message?.includes("revision_conflict");
    console.error("[documents/fill-info] revision update failed:", updErr.message);
    return NextResponse.json(
      { error: conflict ? "This document changed while you were answering. Refresh and try again." : "Could not save your answers" },
      { status: conflict ? 409 : 500 },
    );
  }
  const revisionState = Array.isArray(applied) ? applied[0] : applied;
  if (revisionState?.requires_review) {
    // The RPC stales the old run atomically. This creates the replacement queue
    // item and is also the attorney notification surfaced by their review list.
    await startDocumentReview(primaryId, doc.case_file_id);
  }
  // The Living File must always absorb new key facts as they become available.
  // Each filled blank is a confirmed fact — write it (deduped) so the next draft,
  // review, and any sibling document can use it without re-asking.
  try {
    const labelByKey = new Map(placeholderFields(doc.draft_text).map((f) => [f.key, f.label]));
    const factDescriptions = Object.entries(clean)
      .filter(([k]) => labelByKey.has(k))
      .map(([k, v]) => `${labelByKey.get(k)}: ${v}`);

    if (factDescriptions.length) {
      const { data: existingFacts } = await writeDb
        .from("fact_items")
        .select("description")
        .eq("case_file_id", doc.case_file_id)
        .eq("status", "confirmed");
      const existing = new Set(
        (existingFacts ?? []).map((f: { description: string }) => f.description.toLowerCase())
      );
      const newFacts = factDescriptions
        .filter((d) => !existing.has(d.toLowerCase()))
        .map((description) => ({
          case_file_id: doc.case_file_id,
          user_id: doc.user_id,
          description,
          status: "confirmed" as const,
        }));
      if (newFacts.length) {
        await writeDb.from("fact_items").insert(newFacts);
      }
    }

    // Reconcile Living File gaps against the freshly-filled draft: filled blanks
    // (now confirmed facts) drop off the outstanding list, and any still-unfilled
    // placeholders remain tracked.
    await syncDraftGapsToLivingFile(writeDb, doc.case_file_id, doc.user_id, text);
  } catch (e) {
    // Fact-sync is best-effort: the document was already updated successfully, so
    // never fail the request over a Living File write.
    console.error("[documents/fill-info] living-file sync failed:", e);
  }

  return NextResponse.json({
    filled,
    remaining: extractPlaceholders(text).length,
    draft_text: text,
    revision: revisionState?.revision_number ?? expectedRevision + 1,
    status: revisionState?.status ?? (lifecycle === "draft_in_place" ? "draft" : "pending_review"),
    review_state: revisionState?.review_state ?? (lifecycle === "draft_in_place" ? "not_required" : "queued"),
    requires_attorney_review: lifecycle !== "draft_in_place",
    forwarded_for_review: lifecycle !== "draft_in_place",
    prior_review_stale: Boolean(activeRun && lifecycle !== "draft_in_place"),
    revised_document_id: revised?.id ?? null,
  });
}
