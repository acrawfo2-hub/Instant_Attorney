import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildDrafterSystemPrompt, buildFileContext } from "@/lib/prompts";
import { extractDraftText } from "@/lib/file-parser";
import { getChildDocuments, getSecondDraftChild } from "@/lib/document-utils";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Document, CaseFile, FactItem, Attachment } from "@/lib/types";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensForDoc, limitSignalMetadata } from "@/lib/token-limits";

// Legal doc edits can be slow on a long document — same ceiling as the wizard route.
export const maxDuration = 300;

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const MODEL = "claude-sonnet-4-6";

/**
 * Andrew's "junior associate" chat: an ongoing, targeted-edit conversation
 * against a document, distinct from the one-shot critical-review/second-draft
 * pipeline in second-draft/route.ts. Always operates on the SECOND-DRAFT
 * CHILD (creating it, seeded from the parent, on first use) — the parent's
 * draft_text is the client's original submission and is never overwritten
 * directly, the same invariant the existing second-draft flow keeps.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
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

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  const { data: parentRow } = await db
    .from("documents")
    .select("*")
    .eq("id", id)
    .is("parent_document_id", null)
    .single();

  if (!parentRow) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  const parent = parentRow as Document;

  if (!parent.draft_text?.trim()) {
    return NextResponse.json({ error: "This document has no draft text to edit yet" }, { status: 400 });
  }

  const children = await getChildDocuments(db, id);
  const existingChild = getSecondDraftChild(children);
  const baseText = existingChild?.draft_text ?? parent.draft_text;

  const [{ data: caseFileRow }, { data: factRows }, { data: attRows }] = await Promise.all([
    db.from("case_files").select("*").eq("id", parent.case_file_id).single(),
    db.from("fact_items").select("*").eq("case_file_id", parent.case_file_id),
    db.from("attachments").select("*").eq("case_file_id", parent.case_file_id).eq("status", "ready"),
  ]);

  if (!caseFileRow) {
    return NextResponse.json({ error: "Case file not found" }, { status: 404 });
  }

  const caseFile = caseFileRow as CaseFile;
  const facts = (factRows ?? []) as FactItem[];
  const attachments = (attRows ?? []) as Attachment[];
  const fileContext = buildFileContext(caseFile, facts, attachments);

  let message: Anthropic.Message;
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: maxOutputTokensForDoc(MODEL, parent.doc_type),
      system: [
        {
          type: "text" as const,
          text: buildDrafterSystemPrompt("attorney"),
          cache_control: { type: "ephemeral" as const },
        },
        {
          type: "text" as const,
          text: `${fileContext}\n\n---DOCUMENT BEING EDITED---\n${baseText}\n---END DOCUMENT---`,
        },
      ],
      messages: body.messages,
    });
    message = await stream.finalMessage();
  } catch (err) {
    console.error("[attorney/chat-edit] Anthropic error:", err);
    return NextResponse.json(
      { error: "We couldn't apply that edit just now. Please try again in a moment." },
      { status: 502 }
    );
  }

  const fullResponse = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const truncated = message.stop_reason === "max_tokens";
  if (truncated) {
    logTruncation({
      endpoint: "attorney/chat-edit",
      feature: "attorney_chat_edit",
      documentId: id,
      caseFileId: parent.case_file_id,
      userId: parent.user_id,
      outputTokens: message.usage.output_tokens,
    });
  }

  const draftText = extractDraftText(fullResponse) ?? (fullResponse.trim() || null);
  if (!draftText) {
    return NextResponse.json({ error: "The edit produced no document text. Please try again." }, { status: 502 });
  }

  // Writes go through the service client — RLS on `documents` only allows the
  // owning client to write their own rows; the caller here is a verified
  // attorney editing the client's document on their behalf.
  const serviceDb = createServiceClient();
  // AI patch boundary: preserve both inputs and outputs. These are top-level
  // revisions even though the editable work product lives in a child row.
  const beforeText = existingChild?.draft_text ?? parent.draft_text ?? "";
  const { data: beforeRevision } = await serviceDb.from("document_revisions").insert({
    document_id: parent.id, content: beforeText, title: parent.title,
    author_type: "system", source_action: "ai_patch_before",
    summary: "Checkpoint before accepted AI edit",
  }).select("id").single();
  let childId: string;
  if (existingChild) {
    childId = existingChild.id;
    // Check whether the update actually matched a row. The Opus second-draft
    // pipeline (upsertSecondDraftChild) DELETES and re-INSERTs this same
    // doc_type when it finishes, so a concurrent "Generate 2nd Draft" run can
    // remove existingChild out from under us between our read and this write.
    // Silently updating 0 rows while still overwriting the parent's
    // denormalized copy below would corrupt it with text that isn't saved
    // anywhere — so fail loudly instead of guessing.
    const { data: updatedRows, error: updateErr } = await serviceDb
      .from("documents")
      .update({
        draft_text: draftText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingChild.id)
      .select("id");
    if (updateErr) {
      console.error("[attorney/chat-edit] child update error:", updateErr.message);
      return NextResponse.json({ error: "The edit couldn't be saved. Please try again." }, { status: 500 });
    }
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "This document changed while your edit was being generated (a second draft may have just finished). Please try again." },
        { status: 409 }
      );
    }
  } else {
    const { data: inserted, error: insertErr } = await serviceDb
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
      .select("id")
      .single();
    if (insertErr || !inserted) {
      // Unique violation (documents_parent_doctype_unique, schema-stage34) means
      // a concurrent request (double-click, second tab, or the second-draft
      // pipeline) already created the second-draft child first — don't silently
      // create a duplicate, ask the caller to retry against the real one.
      if (insertErr?.code === "23505") {
        return NextResponse.json(
          { error: "Another edit just started on this document. Please try again." },
          { status: 409 }
        );
      }
      console.error("[attorney/chat-edit] child insert error:", insertErr?.message);
      return NextResponse.json({ error: "The edit was generated but couldn't be saved. Please try again." }, { status: 500 });
    }
    childId = inserted.id;
  }

  // Keep the parent's denormalized copy in sync, same as upsertSecondDraftChild.
  await serviceDb.from("documents").update({
    improved_draft_text: draftText,
    updated_at: new Date().toISOString(),
  }).eq("id", parent.id);

  await serviceDb.from("document_revisions").insert({
    document_id: parent.id, parent_revision_id: beforeRevision?.id ?? null,
    content: draftText, title: parent.title, author_type: "ai",
    source_action: "ai_patch_after", summary: "Accepted AI edit",
  });

  recordAiFromMessage(db, message, {
    userId: parent.user_id,
    actorId: userId,
    caseFileId: parent.case_file_id,
    feature: "attorney_chat_edit",
    metadata: {
      document_id: childId,
      ...limitSignalMetadata({
        model: message.model,
        outputTokens: message.usage.output_tokens,
        priorLimit: 8000,
        stopReason: message.stop_reason,
      }),
    },
  }).catch((e) => console.error("[attorney/chat-edit] usage record error:", e));

  return NextResponse.json({
    documentId: childId,
    text: fullResponse,
    truncated,
  });
}
