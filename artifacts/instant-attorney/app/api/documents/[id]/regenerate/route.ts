// Regenerate a client document against the CURRENT Living File.
//
// Surfaced only when a document is "out of date" — i.e. the client changed their
// facts or What-If / hypothetical answers AFTER the draft was generated. This is
// a deliberate, per-document client action: there is no auto-regeneration and no
// bulk update. It mirrors the wizard's drafting path (same model, system prompt,
// file context — so hypotheticals flow in via buildFileContext) but operates on
// one known document the caller owns, and PRESERVES that document's lifecycle
// status (a draft already with the attorney must not be knocked back to "draft").
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DRAFTER_SYSTEM_PROMPT, wizardFieldGuidance, buildFileContext } from "@/lib/prompts";
import { parseAndUpdateFile, extractDraftText, syncDraftGapsToLivingFile, isCompleteFileUpdate } from "@/lib/file-parser";
import { stampFactsSynced, isValidWizardType } from "@/lib/document-utils";
import { loadAttachmentAsContentBlocks } from "@/lib/attachment-processor";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { getBillingGate } from "@/lib/topup";
import { BYPASS_USER_ID, WIZARD_LABELS } from "@/lib/types";
import type { WizardType, CaseFile, FactItem, Attachment, RequestedAttachment, Document } from "@/lib/types";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";

// Legal doc generation can be slow — allow up to 5 minutes like the wizard route.
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Only documents the client still owns the editing of can be regenerated. A
// finalized/delivered deliverable is the attorney's work product — regenerating
// the client's wizard draft underneath it would be confusing and is out of scope.
const REGENERABLE_STATUSES = new Set(["draft", "changes_requested", "pending_review"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }

  let userId: string;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  // Load the document scoped to the caller. RLS on documents already constrains
  // to the owner for the user-scoped client; the explicit user_id filter also
  // makes the bypass/service path safe.
  const { data: docRow, error: docErr } = await db
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (docErr || !docRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const doc = docRow as Document;

  // Child documents (critical review / second draft) are attorney work product,
  // not client wizard drafts — never regenerable here.
  if (doc.parent_document_id) {
    return NextResponse.json({ error: "This document can't be regenerated." }, { status: 400 });
  }

  const wizardType = doc.doc_type as string;
  if (!isValidWizardType(wizardType)) {
    return NextResponse.json({ error: "This document type can't be regenerated." }, { status: 400 });
  }

  if (!REGENERABLE_STATUSES.has(doc.status)) {
    return NextResponse.json(
      { error: "This document can no longer be regenerated." },
      { status: 400 }
    );
  }

  const caseFileId = doc.case_file_id;

  // Subscription + case-ownership guards mirror the wizard route. fact_items RLS
  // only checks user_id (NOT case ownership), so verify the caller owns the case
  // app-side before drafting against / writing to it.
  if (!BYPASS_AUTH) {
    const { data: sub } = await db
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    const activeStatuses = ["active", "trialing", "bypass"];
    if (!sub || !activeStatuses.includes(sub.status)) {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    // Pre-call billing gate: block new AI spend while a top-up is pending/failed.
    const gate = await getBillingGate(userId);
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: "Token top-up required",
          reason: gate.reason,
          meter_usd: gate.meterUsd,
          threshold_usd: gate.thresholdUsd,
        },
        { status: 402 }
      );
    }

    const { data: ownedCase } = await db
      .from("case_files")
      .select("id")
      .eq("id", caseFileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ownedCase) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // All persistence goes through the service client (documents RLS blocks the
  // user-scoped client from writing even its own rows in this project's live DB).
  const writeDb = BYPASS_AUTH ? db : createServiceClient();

  // Load the current file state — refreshed now so the new draft reflects every
  // fact and What-If / hypothetical answer added since the last generation.
  const [{ data: caseFileRow }, { data: factRows }, { data: attachmentRows }, { data: requestedRows }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId),
      db.from("attachments").select("*").eq("case_file_id", caseFileId).eq("status", "ready"),
      db.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
    ]);

  const caseFile = caseFileRow as CaseFile | null;
  if (!caseFile) {
    return NextResponse.json({ error: "Case file not found" }, { status: 404 });
  }
  const facts = (factRows ?? []) as FactItem[];
  const attachments = (attachmentRows ?? []) as Attachment[];
  const requestedAttachments = (requestedRows ?? []) as RequestedAttachment[];
  const fileContext = buildFileContext(caseFile, facts, attachments, requestedAttachments);
  const instrumentKey = doc.instrument_key ?? (doc.content_json as Record<string, unknown> | null)?.instrument_key as string | undefined;
  const fieldHints = wizardFieldGuidance(wizardType as WizardType, instrumentKey);

  // For a general document the specific instrument isn't stored as its own field;
  // recover it from the saved title (drafted as "<instrument> — <date>") so the
  // regenerated draft keeps targeting the same instrument.
  const instrument =
    wizardType === "general_document"
      ? doc.title.replace(/\s+—\s+.*$/, "").trim() || null
      : null;
  const documentLabel = instrument ?? WIZARD_LABELS[wizardType as WizardType];

  const initMsg = instrument
    ? `Please draft a ${instrument} based on my Living File.`
    : `Please draft a ${documentLabel} based on my Living File. Document type: ${wizardType}`;

  // "Improve My Draft" documents were built from the client's own uploaded
  // file — re-include it here so a regeneration keeps improving that same
  // document instead of silently falling back to a from-scratch redraft.
  let regenerateMessage: Anthropic.MessageParam = { role: "user", content: initMsg };
  if (wizardType === "improve_draft") {
    const baseAttachmentId = (doc.content_json as Record<string, unknown> | null)?.base_attachment_id as
      | string
      | undefined;
    if (baseAttachmentId) {
      const loaded = await loadAttachmentAsContentBlocks(writeDb, baseAttachmentId, caseFileId, userId);
      if (loaded) {
        regenerateMessage = {
          role: "user",
          content: [
            ...(loaded.blocks as (Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | Anthropic.TextBlockParam)[]),
            { type: "text" as const, text: `Uploaded file: ${loaded.fileName}\n\n${initMsg}` },
          ],
        };
      }
    }
  }

  // Stream server-side then assemble — the SDK refuses non-streaming requests
  // whose max_tokens risks a >10-min response (our 64k ceiling), and we never
  // pass SSE through Replit's proxy. Return a single JSON payload.
  let message: Anthropic.Message;
  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
      system: [
        { type: "text" as const, text: DRAFTER_SYSTEM_PROMPT },
        {
          type: "text" as const,
          text: `Document being drafted: ${documentLabel}\n\n${fieldHints}`,
          cache_control: { type: "ephemeral" as const },
        },
        { type: "text" as const, text: fileContext },
      ],
      messages: [regenerateMessage],
    });
    message = await stream.finalMessage();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Anthropic API error";
    console.error("[documents/regenerate] Anthropic error:", msg);
    return NextResponse.json(
      { error: "We couldn't regenerate your draft just now. Please try again in a moment." },
      { status: 502 }
    );
  }

  const fullResponse = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  recordAiFromMessage(db, message, {
    userId,
    actorId: userId,
    caseFileId,
    feature: "wizard",
    metadata: {
      wizard_type: wizardType,
      regenerate: true,
      ...limitSignalMetadata({
        model: message.model,
        outputTokens: message.usage.output_tokens,
        priorLimit: 8000,
        stopReason: message.stop_reason,
      }),
    },
  }).catch((e) => console.error("[documents/regenerate] usage record error:", e));

  const truncated = message.stop_reason === "max_tokens";
  if (truncated) {
    logTruncation({
      endpoint: "documents/regenerate",
      feature: wizardType,
      caseFileId,
      userId,
      outputTokens: message.usage.output_tokens,
    });
  }

  const draftText = extractDraftText(fullResponse) ?? (fullResponse.trim() || null);
  if (!draftText) {
    return NextResponse.json(
      { error: "We couldn't regenerate your draft just now. Please try again." },
      { status: 502 }
    );
  }

  // Overwrite the SAME document in place, PRESERVING its lifecycle status — a
  // draft already submitted (pending_review) or returned for changes
  // (changes_requested) must keep that status, never silently fall back to
  // "draft" (that would drop it from the attorney's queue).
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    draft_text: draftText,
    updated_at: now,
  };
  const existingCj = (doc.content_json as Record<string, unknown>) ?? {};
  update.content_json = {
    ...existingCj,
    init_response: fullResponse,
    truncated: truncated ? true : undefined,
  };

  // If the client regenerates a draft that is CURRENTLY in the attorney's review
  // queue, the reviewed text has just changed underneath the attorney. Restart
  // the review on the new content: reset submitted_at so the 48-hour clock and
  // queue ordering reflect the current draft (never review stale text on a stale
  // clock, or approve a version that was never read).
  const wasInReview = doc.status === "pending_review";
  if (wasInReview) {
    update.submitted_at = now;
  }

  const { error: updateErr } = await writeDb
    .from("documents")
    .update(update)
    .eq("id", documentId)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("[documents/regenerate] update failed:", updateErr.message);
    return NextResponse.json(
      { error: "We regenerated your draft but couldn't save it. Please try again.", text: fullResponse },
      { status: 500 }
    );
  }

  // Any attorney work-product (critical review / second draft) was built against
  // the OLD text and is now stale — drop it so the attorney re-reviews the
  // regenerated draft from scratch. Mirrors the resubmit path in
  // finalizeDocumentSubmission. Best-effort: never fail the regeneration over it.
  if (wasInReview) {
    await writeDb
      .from("documents")
      .delete()
      .eq("parent_document_id", documentId)
      .in("doc_type", ["critical_review", "second_draft"])
      .then(undefined, (err) =>
        console.error("[documents/regenerate] stale child cleanup error:", err)
      );
  }

  // Apply the same post-generation Living File writes the wizard does, so the
  // file's confirmed facts / outstanding gaps stay in sync with the new draft.
  if (isCompleteFileUpdate(fullResponse)) {
    try {
      await parseAndUpdateFile(writeDb, caseFileId, userId, fullResponse);
    } catch (parseErr) {
      console.error("[documents/regenerate] file parser error:", parseErr);
    }
  }
  try {
    await syncDraftGapsToLivingFile(writeDb, caseFileId, userId, draftText);
  } catch (gapErr) {
    console.error("[documents/regenerate] gap sync error:", gapErr);
  }

  // Stamp LAST (after the Living File writes above) so facts_synced_at sits
  // at/after any fact change this regeneration caused — clearing the "out of
  // date" flag for this document. Best-effort: a missing column never fails the
  // regeneration (staleness simply stays dormant until the migration runs).
  await stampFactsSynced(writeDb, documentId);

  return NextResponse.json({
    ok: true,
    documentId,
    status: doc.status,
    truncated,
  });
}
