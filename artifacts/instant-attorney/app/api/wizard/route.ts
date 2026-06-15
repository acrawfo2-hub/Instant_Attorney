import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DRAFTER_SYSTEM_PROMPT, WIZARD_FIELD_HINTS, buildFileContext } from "@/lib/prompts";
import { parseAndUpdateFile, extractDraftText } from "@/lib/file-parser";
import { findReusableDocument } from "@/lib/document-utils";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { BYPASS_USER_ID, WIZARD_LABELS } from "@/lib/types";
import type { WizardType, CaseFile, FactItem, Attachment, RequestedAttachment } from "@/lib/types";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";

// Allow up to 5 minutes for this route — legal doc generation can be slow
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { messages, caseFileId, wizardType, documentId, instrument } = body;

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
  const [{ data: caseFileRow }, { data: factRows }, { data: attachmentRows }, { data: requestedRows }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId),
      db.from("attachments").select("*").eq("case_file_id", caseFileId).eq("status", "ready"),
      db.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
    ]);

  const caseFile = caseFileRow as CaseFile | null;
  const facts = (factRows ?? []) as FactItem[];
  const attachments = (attachmentRows ?? []) as Attachment[];
  const requestedAttachments = (requestedRows ?? []) as RequestedAttachment[];
  const fileContext = caseFile ? buildFileContext(caseFile, facts, attachments, requestedAttachments) : "";
  const fieldHints = WIZARD_FIELD_HINTS[wizardType as WizardType];

  const documentLabel = (wizardType === "general_document" && instrument)
    ? instrument
    : WIZARD_LABELS[wizardType as WizardType];

  // Stream server-side, then assemble the full message before responding.
  // Why streaming: the SDK refuses a *non-streaming* request whose max_tokens is
  // large enough to risk a >10-minute response (our full document ceiling is
  // 64k tokens), throwing "Streaming is required…" before the call even leaves
  // the server — which 502'd every draft generation. Consuming the stream here
  // and returning a single JSON payload keeps the client contract unchanged and
  // proxy-safe (we never pass SSE through Replit's proxy to the browser).
  let message: Anthropic.Message;
  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
      system: [
        {
          type: "text" as const,
          text: DRAFTER_SYSTEM_PROMPT,
        },
        {
          type: "text" as const,
          text: `Document being drafted: ${documentLabel}\n\n${fieldHints}`,
          cache_control: { type: "ephemeral" as const },
        },
        {
          type: "text" as const,
          text: fileContext,
        },
      ],
      messages: sanitizedMessages,
    });
    message = await stream.finalMessage();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Anthropic API error";
    console.error("[wizard] Anthropic error:", msg);
    // Keep the client-facing message friendly — never leak raw SDK internals to
    // a client. The drafter route always recovers into a usable state on retry.
    return NextResponse.json(
      { error: "We couldn't finish generating your draft just now. Please try again in a moment." },
      { status: 502 }
    );
  }

  const fullResponse = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

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

  // Detect truncation before saving so the flag lands in content_json
  const truncated = message.stop_reason === "max_tokens";
  if (truncated) {
    logTruncation({
      endpoint: "wizard",
      feature: wizardType,
      caseFileId,
      userId,
      outputTokens: message.usage.output_tokens,
    });
  }

  // Save the draft text to the documents table. Always persist *something* when
  // the model returned any text: if it omitted the ---DRAFT READY--- markers (or
  // truncated before them), fall back to the raw response so the client always
  // gets a documentId back and can submit for attorney review. A markerless
  // response must never strand a client with an on-screen draft they can't send.
  const draftText = extractDraftText(fullResponse) ?? (fullResponse.trim() || null);
  let savedDocId: string | undefined = documentId as string | undefined;

  if (draftText) {
    const now = new Date().toISOString();

    if (!savedDocId) {
      const existing = await findReusableDocument(writeDb, caseFileId, wizardType, userId);
      savedDocId = existing?.id;
    }

    // `writeDb` is the service client and bypasses RLS, so every existing-document
    // read/write below MUST be scoped to this caller. `savedDocId` can come from
    // the caller-supplied `documentId`, so without `user_id`/`case_file_id`
    // predicates a client could target — and overwrite — another user's document
    // (IDOR). If a supplied id isn't this caller's (or no longer exists), we drop
    // it and create a fresh document instead of mutating a foreign row.
    let existingDoc: { status: string | null; content_json: unknown } | null = null;
    if (savedDocId) {
      const { data } = await writeDb
        .from("documents")
        .select("status, content_json")
        .eq("id", savedDocId)
        .eq("user_id", userId)
        .eq("case_file_id", caseFileId)
        .maybeSingle();
      existingDoc = data ?? null;
      if (!existingDoc) savedDocId = undefined;
    }

    if (savedDocId && existingDoc) {
      // Preserve where the document already is in its lifecycle. Once a client
      // has sent a draft for review (pending_review) — or the attorney has asked
      // for changes (changes_requested), or finalized it (approved/delivered) —
      // editing it again must NOT silently knock it back to a plain "draft".
      // Doing so would drop it out of the attorney's queue and make the client's
      // progress disappear. Only a brand-new or still-"pre_warmed" suggestion
      // gets promoted to "draft".
      const curStatus = existingDoc.status as string | undefined;
      const nextStatus = curStatus && curStatus !== "pre_warmed" ? curStatus : "draft";

      const update: Record<string, unknown> = {
        draft_text: draftText,
        status: nextStatus,
        updated_at: now,
      };
      // Merge truncated flag into existing content_json when re-generating
      if (truncated) {
        const existingCj = (existingDoc.content_json as Record<string, unknown>) ?? {};
        update.content_json = { ...existingCj, truncated: true };
      }
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
          content_json: { init_response: fullResponse, ...(truncated ? { truncated: true } : {}) },
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

    // We generated a draft but could not persist it. Fail loudly instead of
    // returning HTTP 200 with documentId: null — that would strand the client
    // with an on-screen draft they can never submit for attorney review (the
    // exact "draft appears but nothing happens" symptom). The client surfaces
    // this error and can retry. `text` is included so no work is lost on screen.
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
  }

  // Log document ID now that it's known
  if (truncated && savedDocId) {
    logTruncation({ endpoint: "wizard/doc-saved", documentId: savedDocId });
  }

  // Update the Living File if the drafter produced a FILE UPDATE block
  if (fullResponse.includes("---FILE UPDATE---")) {
    try {
      await parseAndUpdateFile(writeDb, caseFileId, userId, fullResponse);
    } catch (parseErr) {
      console.error("[wizard] file parser error:", parseErr);
    }
  }

  return NextResponse.json({
    text: fullResponse,
    documentId: savedDocId ?? null,
    truncated,
  });
}
