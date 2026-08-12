import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import {
  REVIEW_IMPROVEMENTS_SYSTEM_PROMPT,
  buildImprovementsUserMessage,
  improvementsAsReviewText,
  parseImprovements,
} from "@/lib/prompts";
import { getSecondDraftChild, upsertCriticalReviewChild, upsertSecondDraftChild } from "@/lib/document-utils";
import { locateImprovementRange, textHash } from "@/lib/improvement-diffs";
import { runAuthoritiesGate } from "@/lib/attorney-review-authorities";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { maxOutputTokensFor } from "@/lib/token-limits";
import type { Document, CaseFile, FactItem, Attachment, DocumentReviewRun } from "@/lib/types";

// The auto-run attorney review orchestrator (schema-stage44). Stage 1 issue-spots
// the working draft into structured `document_improvements`; attorney decisions
// then apply reviewed diffs one passage at a time to the working child. Runs on
// the SERVICE client so it survives independent of any request's
// auth, and is fired-and-forgotten from finalizeDocumentSubmission on submit.
// See docs/attorney-review-orchestrator.md.

const IMPROVEMENTS_MODEL = "claude-sonnet-4-6";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

/**
 * Start a review run for a submitted document, unless one is already active. Inserts
 * a `queued` run row (fast, synchronous) and fires processing without awaiting so
 * the caller (e.g. the client's submit request) returns immediately. Returns the
 * run row, or the already-active run if one exists. Safe to call more than once —
 * the active-run guard makes the auto-kickoff and the page-load self-heal converge
 * on a single run. Uses the service client, so it never depends on request auth.
 */
export async function startDocumentReview(
  documentId: string,
  caseFileId: string,
): Promise<DocumentReviewRun | null> {
  const db = createServiceClient();
  const { data: active } = await db
    .from("document_review_runs")
    .select("*")
    .eq("document_id", documentId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return active as DocumentReviewRun;

  const { data: run, error } = await db
    .from("document_review_runs")
    .insert({
      document_id: documentId,
      case_file_id: caseFileId,
      status: "queued",
      stage: "queued",
    })
    .select("*")
    .single();
  if (error || !run) {
    console.error("[attorney-review] run insert error:", error);
    return null;
  }

  // Fire-and-forget. Errors are captured inside runDocumentReview (marks the run
  // failed); this catch is a last resort so a rejection can't crash the process.
  void runDocumentReview((run as DocumentReviewRun).id).catch((err) =>
    console.error("[attorney-review] run crashed:", err),
  );

  return run as DocumentReviewRun;
}

/** Execute a queued/failed run end to end. Idempotent per run id. */
export async function runDocumentReview(runId: string): Promise<void> {
  const db = createServiceClient();

  const { data: runRow } = await db
    .from("document_review_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  const run = runRow as DocumentReviewRun | null;
  if (!run) return;
  // Don't reprocess a finished run.
  if (run.status === "complete") return;

  const documentId = run.document_id;

  try {
    const { data: docRow } = await db
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .is("parent_document_id", null)
      .maybeSingle();
    const parentDoc = docRow as Document | null;
    if (!parentDoc) throw new Error("Document not found");

    const { data: childRows } = await db.from("documents").select("*").eq("parent_document_id", documentId);
    const existingWorking = getSecondDraftChild((childRows ?? []) as Document[]);
    const sourceText = existingWorking?.draft_text ?? parentDoc.draft_text ?? "";
    const reviewDoc = { ...parentDoc, draft_text: sourceText };

    const [{ data: caseFileRow }, { data: factRows }, { data: attRows }] = await Promise.all([
      db.from("case_files").select("*").eq("id", parentDoc.case_file_id).single(),
      db.from("fact_items").select("*").eq("case_file_id", parentDoc.case_file_id),
      db.from("attachments").select("*").eq("case_file_id", parentDoc.case_file_id).eq("status", "ready"),
    ]);
    if (!caseFileRow) throw new Error("Case file not found");
    const caseFile = caseFileRow as CaseFile;
    const facts = (factRows ?? []) as FactItem[];
    const attachments = (attRows ?? []) as Attachment[];

    await db
      .from("document_review_runs")
      .update({ status: "running", stage: "improvements", updated_at: new Date().toISOString() })
      .eq("id", runId);
    await db
      .from("documents")
      .update({ review_status: "reviewing", updated_at: new Date().toISOString() })
      .eq("id", documentId);

    let inputTokens = 0;
    let outputTokens = 0;

    // ── Stage 1: structured improvements ────────────────────────────────────
    const improvementsResp = await anthropic.messages
      .stream({
        model: IMPROVEMENTS_MODEL,
        max_tokens: maxOutputTokensFor(IMPROVEMENTS_MODEL),
        system: [
          {
            type: "text" as const,
            text: REVIEW_IMPROVEMENTS_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: [
          { role: "user", content: buildImprovementsUserMessage(reviewDoc, caseFile, facts, attachments) },
        ],
      })
      .finalMessage();

    inputTokens += improvementsResp.usage.input_tokens;
    outputTokens += improvementsResp.usage.output_tokens;
    await recordAiFromMessage(db, improvementsResp, {
      userId: parentDoc.user_id,
      caseFileId: parentDoc.case_file_id,
      feature: "attorney_review",
      metadata: { document_id: documentId, run_id: runId, stage: "improvements" },
    });

    const improvementsText = improvementsResp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const improvements = parseImprovements(improvementsText);
    if (improvements.length === 0) {
      throw new Error("Review produced no usable improvements");
    }

    // Preserve prior human decisions for identical evidence. A rejected finding
    // remains rejected until either its substance or the working revision changes.
    const evidenceRows = improvements.map((imp) => ({
      imp,
      evidenceHash: textHash(`${textHash(sourceText)}|${imp.section}|${imp.title}|${imp.rationale}|${imp.proposed_change}`),
    }));
    const { data: priorDecisions } = await db.from("document_improvements")
      .select("evidence_hash,status,attorney_rationale,disposition_by,disposition_at")
      .eq("document_id", documentId)
      .in("status", ["rejected", "ask_partner", "needs_client_input"]);
    const decisions = new Map((priorDecisions ?? []).map((row: Record<string, unknown>) => [row.evidence_hash, row]));

    await db.from("document_improvements").update({ status: "superseded" })
      .eq("document_id", documentId).eq("status", "proposed");
    await db.from("document_improvements").insert(
      evidenceRows.map(({ imp, evidenceHash }, i) => {
        const prior = decisions.get(evidenceHash) as Record<string, unknown> | undefined;
        return {
          run_id: runId, document_id: documentId, seq: i + 1,
          section: imp.section, kind: imp.kind, severity: imp.severity,
          title: imp.title, rationale: imp.rationale, proposed_change: imp.proposed_change,
          anchor: locateImprovementRange(sourceText, imp), evidence_hash: evidenceHash,
          status: prior?.status ?? "proposed",
          attorney_rationale: prior?.attorney_rationale ?? "",
          disposition_by: prior?.disposition_by ?? null, disposition_at: prior?.disposition_at ?? null,
        };
      }),
    );

    // Keep the existing review page's "Critical Review" doc populated by
    // rendering the improvements into the memo format it already reads.
    await upsertCriticalReviewChild(
      db,
      parentDoc,
      `---DOCUMENT REVIEW---\n${improvementsAsReviewText(improvements)}\n---END REVIEW---`,
    );

    // ── Stage 2: initialize the working revision without applying findings ─
    // Findings are proposals. Only the mutation endpoint may write accepted text.
    if (!existingWorking && sourceText.trim()) {
      await upsertSecondDraftChild(db, parentDoc, sourceText, "Working copy created; no proposed improvements applied.");
    }

    // ── Stage 3: QA the current accepted working revision ───────────────────
    if (sourceText.trim()) {
      await db.from("document_review_runs").update({ stage: "authorities", updated_at: new Date().toISOString() }).eq("id", runId);
      await runAuthoritiesGate(db, runId, parentDoc, sourceText);
    }

    // ── Done ────────────────────────────────────────────────────────────────
    const now = new Date().toISOString();
    await db
      .from("document_review_runs")
      .update({
        status: "complete",
        stage: "complete",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        updated_at: now,
        completed_at: now,
      })
      .eq("id", runId);
    await db.from("documents").update({ review_status: null, updated_at: now }).eq("id", documentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review run failed";
    console.error("[attorney-review] run failed:", message);
    const now = new Date().toISOString();
    await db
      .from("document_review_runs")
      .update({ status: "failed", error: message, updated_at: now })
      .eq("id", runId);
    await db.from("documents").update({ review_status: null, updated_at: now }).eq("id", documentId);
  }
}
