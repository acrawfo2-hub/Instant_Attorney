import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseAndUpdateFile, syncDraftGapsToLivingFile, isCompleteFileUpdate } from "@/lib/file-parser";
import { saveDocumentRevision } from "@/lib/document-persistence";
import { resolveWizardDocumentTarget, stampFactsSynced } from "@/lib/document-utils";
import { loadAttachmentAsContentBlocks } from "@/lib/attachment-processor";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { getBillingGate } from "@/lib/topup";
import { BYPASS_USER_ID, WIZARD_LABELS } from "@/lib/types";
import type { WizardType, CaseFile, FactItem, Attachment, RequestedAttachment } from "@/lib/types";
import { logTruncation } from "@/lib/truncation-logger";
import { limitSignalMetadata } from "@/lib/token-limits";
import { draftInstrument } from "@/lib/document-drafting";

// Allow up to 5 minutes for this route — legal doc generation can be slow
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { messages, caseFileId, wizardType, documentId, instrument, instrumentKey, planKey, baseAttachmentId, isInit, governingForum } = body;
  const planKeyStr = typeof planKey === "string" && planKey.trim() ? planKey.trim() : undefined;
  let instrumentKeyStr = typeof instrumentKey === "string" && instrumentKey.trim() ? instrumentKey.trim() : undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  if (!wizardType || !WIZARD_LABELS[wizardType as WizardType]) {
    return NextResponse.json({ error: "Invalid wizard type" }, { status: 400 });
  }

  if (!caseFileId) {
    return NextResponse.json({ error: "caseFileId required" }, { status: 400 });
  }

  // Drop empty assistant turns — they break Anthropic message validation on follow-ups
  const sanitizedMessages = messages.filter(
    (m: { role: string; content: string }) =>
      !(m.role === "assistant" && !m.content?.trim())
  );

  if (!sanitizedMessages.length) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
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

    const { data: sub } = await db
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    const activeStatuses = ["active", "trialing", "bypass"];
    if (!sub || !activeStatuses.includes(sub.status)) {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    userId = user.id;

    // Pre-call billing gate: stop new AI spend while a token top-up is pending
    // or failed, bounding overshoot and protecting gross margin.
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

    // Guard against operating on someone else's case. This route writes
    // fact_items and documents keyed by the caller-supplied caseFileId, and
    // fact_items RLS only checks user_id (NOT case ownership) — so without this
    // an authed user could attach facts/drafts to another user's case. The
    // RLS-scoped select returns nothing for a case the caller doesn't own.
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

  // All persistence below goes through the service client. RLS on `documents`
  // in this project's live database blocks the anon/user-scoped client from
  // INSERTing even the caller's own rows, which silently stranded every
  // generated draft (text returned, but documentId null → the client could
  // never submit it for attorney review, and the documents table stayed empty).
  // We've already authenticated the user and verified case ownership above, so
  // a service-role write is safe and is the same client bypass mode uses.
  const writeDb = BYPASS_AUTH ? db : createServiceClient();

  // Load current file state — refreshed on every call so answers update the context
  const [{ data: caseFileRow }, { data: factRows }, { data: attachmentRows }, { data: requestedRows }, { data: profileRow }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId),
      db.from("attachments").select("*").eq("case_file_id", caseFileId).eq("status", "ready"),
      db.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
      db.from("profiles").select("account_type").eq("id", userId).maybeSingle(),
    ]);

  // `let`, not `const`: the governing-forum path below replaces this with a
  // forum-corrected copy before drafting (#114).
  let caseFile = caseFileRow as CaseFile | null;
  // Existing clients send only planKey. Resolve its independent profile key
  // from the persisted plan instead of conflating the two identities.
  instrumentKeyStr ??= caseFile?.legal_strategy?.document_plan
    ?.find((entry) => entry.key === planKeyStr)?.instrument_key;
  const facts = (factRows ?? []) as FactItem[];
  const attachments = (attachmentRows ?? []) as Attachment[];
  const requestedAttachments = (requestedRows ?? []) as RequestedAttachment[];
  const suppliedForum = typeof governingForum === "string" ? governingForum.trim() : "";
  if (suppliedForum && caseFile) {
    const { error: forumUpdateError } = await writeDb
      .from("case_files")
      .update({ jurisdiction: suppliedForum, updated_at: new Date().toISOString() })
      .eq("id", caseFileId)
      .eq("user_id", userId);
    if (forumUpdateError) {
      return NextResponse.json({ error: "We couldn't save that jurisdiction or forum. Please try again." }, { status: 500 });
    }
    caseFile = { ...caseFile, jurisdiction: suppliedForum };
  }

  // Attorney-users get a targeted-edit follow-up behavior instead of a full
  // regeneration on every turn — same prompt, different "on follow-up" rule.
  const drafterPersona = profileRow?.account_type === "attorney_user" ? "attorney" as const : "client" as const;

  const documentLabel = typeof instrument === "string" && instrument.trim()
    ? instrument.trim()
    : WIZARD_LABELS[wizardType as WizardType];

  // "Improve My Draft" feeds the client's own uploaded document verbatim into
  // the initial call, instead of drafting from the Living File alone. Only the
  // very first call needs this — follow-up turns build on the draft already in
  // the conversation history via `messages`.
  let anthropicMessages = sanitizedMessages;
  if (wizardType === "improve_draft" && isInit && baseAttachmentId) {
    const loaded = await loadAttachmentAsContentBlocks(writeDb, baseAttachmentId, caseFileId, userId);
    if (loaded) {
      const firstUserText = sanitizedMessages[0]?.content ?? "";
      anthropicMessages = [
        {
          role: "user" as const,
          content: [
            ...(loaded.blocks as (Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | Anthropic.TextBlockParam)[]),
            { type: "text" as const, text: `Uploaded file: ${loaded.fileName}\n\n${firstUserText}` },
          ],
        },
        ...sanitizedMessages.slice(1),
      ];
    }
  }

  // Attorney-persona follow-ups: the drafter always re-renders the complete
  // document on every turn, so resending the full conversation history means
  // every prior assistant turn's full-document text gets resent again on
  // every subsequent call — O(turns^2 * document size) input tokens over a
  // multi-turn editing session. Since the saved draft already reflects every
  // earlier edit, we don't need the history at all: send just the latest
  // instruction, with the CURRENT saved draft injected fresh into the system
  // prompt each call (same approach as the attorney chat-edit route).
  let currentDraftContext = "";
  if (drafterPersona === "attorney" && !isInit && documentId) {
    const lastMsg = sanitizedMessages[sanitizedMessages.length - 1];
    if (lastMsg?.role === "user") {
      const { data: currentDoc } = await writeDb
        .from("documents")
        .select("draft_text")
        .eq("id", documentId)
        .eq("user_id", userId)
        .maybeSingle();
      if (currentDoc?.draft_text) {
        currentDraftContext = `\n\n---CURRENT DRAFT (apply the requested change to this exact text)---\n${currentDoc.draft_text}\n---END CURRENT DRAFT---`;
        anthropicMessages = [lastMsg];
      }
    }
  }

  // The generation pipeline — identity, authority, spec, risk gate, generate,
  // refine, validate — lives in lib/document-drafting.ts so the orchestrator's
  // durable worker runs the same one. This route owns the conversation, the
  // persistence and the response shape; it does not own the drafting.
  const drafted = await draftInstrument(anthropic, {
    wizardType: wizardType as WizardType,
    instrumentLabel: documentLabel,
    planKey: planKeyStr,
    instrumentKey: instrumentKeyStr,
    persona: drafterPersona,
    caseFile,
    facts,
    attachments,
    requestedAttachments,
    messages: anthropicMessages,
    extraContext: currentDraftContext,
  });

  if (drafted.kind === "blocked") {
    return NextResponse.json({ blocking: drafted.blocking }, { status: 409 });
  }
  if (drafted.kind === "error") {
    // Keep the client-facing message friendly — never leak raw SDK internals to
    // a client. The drafter route always recovers into a usable state on retry.
    return NextResponse.json(
      { error: "We couldn't finish generating your draft just now. Please try again in a moment." },
      { status: 502 }
    );
  }

  const { fullResponse, renderedResponse, truncated, structuredSections, validationReport } = drafted;
  const message = drafted.message;

  // Defense in depth: recognize the drafter's structured gate if context was
  // ambiguous in a way the deterministic preflight could not identify.
  const modelBlock = fullResponse.trim().match(/^\{"blocking":([\s\S]+)\}$/);
  if (modelBlock) {
    try {
      const parsedBlock = JSON.parse(fullResponse) as { blocking?: { code?: string } };
      if (parsedBlock.blocking?.code === "MISSING_GOVERNING_FORUM") {
        return NextResponse.json(parsedBlock, { status: 409 });
      }
    } catch {
      // Not valid structured output; process it as an ordinary model response.
    }
  }

  // Record usage (fire-and-forget, don't block the response)
  recordAiFromMessage(db, message, {
    userId,
    actorId: userId,
    caseFileId,
    feature: "wizard",
    metadata: {
      wizard_type: wizardType,
      ...limitSignalMetadata({
        model: message.model,
        outputTokens: message.usage.output_tokens,
        priorLimit: 8000,
        stopReason: message.stop_reason,
      }),
    },
  }).catch((e) => console.error("[wizard] usage record error:", e));

  if (truncated) {
    logTruncation({
      endpoint: "wizard",
      feature: wizardType,
      caseFileId,
      userId,
      outputTokens: message.usage.output_tokens,
    });
  }

  // Raw output is always retained for recovery/debugging, but never promoted to
  // renderable draft_text unless the complete draft block was parsed.
  const draftText = drafted.draftText;
  const generationIncomplete = !draftText;
  const incompleteReason = drafted.incompleteReason ?? "empty_draft_block";
  let savedDocId: string | undefined = documentId as string | undefined;

  // Kept #111's wider condition rather than #112's `if (draftText)`: an
  // incomplete generation can return prose with no extractable draft, and that
  // run still has to persist its generation_state so the retry path can see it.
  if (draftText || fullResponse.trim()) {
    const now = new Date().toISOString();

    const target = await resolveWizardDocumentTarget(writeDb, {
      caseFileId,
      wizardType,
      userId,
      suppliedDocumentId: savedDocId,
      planKey: planKeyStr,
      instrumentKey: instrumentKeyStr,
    });

    if (target.action === "already_finalized") {
      return NextResponse.json({
        text: target.document.draft_text ?? fullResponse,
        documentId: target.document.id,
        truncated: false,
        alreadyFinalized: true,
        status: target.document.status,
      });
    }

    if (target.action === "update") {
      savedDocId = target.documentId;
      const existingDoc = target.existing;
      const curStatus = existingDoc.status as string | undefined;
      const nextStatus = curStatus ?? "draft";

      const update: Record<string, unknown> = {
        status: nextStatus,
        updated_at: now,
        // #115's stable document identity, promoted to its own column.
        ...(instrumentKeyStr ? { instrument_key: instrumentKeyStr } : {}),
        // Written unconditionally, not behind #115's change-detection guard:
        // #111 relies on generation_state/raw_generation_response being
        // refreshed on every attempt to tell an incomplete draft from a good
        // one, and a guarded write would leave stale state after a clean retry.
        content_json: {
          ...((existingDoc.content_json as Record<string, unknown>) ?? {}),
          generation_state: generationIncomplete ? "generation_incomplete" : "complete",
          generation_incomplete: generationIncomplete,
          raw_generation_response: fullResponse,
          ...(generationIncomplete ? { generation_incomplete_reason: incompleteReason } : {}),
          ...(truncated ? { truncated: true } : { truncated: false }),
          ...(planKeyStr ? { plan_key: planKeyStr } : {}),
          ...(instrumentKeyStr ? { instrument_key: instrumentKeyStr } : {}),
          validation_report: validationReport,
        },
      };
      // A failed retry must not overwrite the last known-good draft.
      if (draftText) update.draft_text = draftText;
      const { error: updateErr } = await writeDb
        .from("documents")
        .update(update)
        .eq("id", savedDocId)
        .eq("user_id", userId);
      if (updateErr) {
        console.error("[wizard] document update failed:", updateErr.message);
        savedDocId = undefined;
      }
    } else {
      const { data: inserted, error: insertErr } = await writeDb
        .from("documents")
        .insert({
          case_file_id: caseFileId,
          user_id: userId,
          doc_type: wizardType,
          title: `${documentLabel} — ${new Date().toLocaleDateString()}`,
          // instrumentKeyStr, not planKeyStr: #122 wrote the plan key here,
          // which re-conflates the two identities #115 separated.
          instrument_key: instrumentKeyStr ?? null,
          content_json: {
            init_response: fullResponse,
            raw_generation_response: fullResponse,
            generation_state: generationIncomplete ? "generation_incomplete" : "complete",
            generation_incomplete: generationIncomplete,
            ...(generationIncomplete ? { generation_incomplete_reason: incompleteReason } : {}),
            ...(truncated ? { truncated: true } : {}),
            ...(planKeyStr ? { plan_key: planKeyStr } : {}),
            ...(instrumentKeyStr ? { instrument_key: instrumentKeyStr } : {}),
            ...(wizardType === "improve_draft" && baseAttachmentId ? { base_attachment_id: baseAttachmentId } : {}),
            validation_report: validationReport,
          },
          draft_text: draftText,
          status: "draft",
          updated_at: now,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("[wizard] document insert failed:", insertErr.message);
      }
      savedDocId = inserted?.id;
    }

    if (!savedDocId) {
      return NextResponse.json(
        {
          error: "We generated your draft but couldn't save it. Please try again.",
          text: fullResponse,
          truncated,
        },
        { status: 500 }
      );
    }

    if (structuredSections.length) {
      const { error: sectionErr } = await writeDb.from("document_sections").upsert(
        structuredSections.map((section) => ({
          document_id: savedDocId,
          section_id: section.id,
          section_kind: section.kind,
          rendered_text: section.text,
          fact_keys: section.factKeys,
          updated_at: now,
        })),
        { onConflict: "document_id,section_id" },
      );
      if (sectionErr) console.error("[wizard] section persistence error:", sectionErr.message);
    }
  }

  if (truncated && savedDocId) {
    logTruncation({ endpoint: "wizard/doc-saved", documentId: savedDocId });
  }

  if (isCompleteFileUpdate(fullResponse)) {
    try {
      await parseAndUpdateFile(writeDb, caseFileId, userId, fullResponse);
    } catch (parseErr) {
      console.error("[wizard] file parser error:", parseErr);
    }
  }

  let gapSyncWarning = false;
  if (draftText && savedDocId) {
    // The document write already happened above, in the update/insert that also
    // carries status, generation_state, instrument_key and validation_report.
    // #118 added a second update here that rewrote only draft_text — redundant,
    // and it displaced the real payload as the last write on the row. persist
    // therefore just names the document; the boundary still stamps the revision
    // id and drives the durable Living File sync, which is its actual job.
    const result = await saveDocumentRevision(writeDb, {
      caseFileId, userId, draftText,
      persist: async () => savedDocId!,
    });
    gapSyncWarning = result.syncPending;
  }

  if (savedDocId) {
    await stampFactsSynced(writeDb, savedDocId);
  }

  const knownFacts = facts
    .filter((f) => f.status === "confirmed")
    .map((f) => f.description);

  return NextResponse.json({
    text: renderedResponse,
    documentId: savedDocId ?? null,
    sections: structuredSections,
    truncated,
    generationIncomplete,
    gapSyncWarning,
    knownFacts,
    validationReport,
  });
}
