import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildDrafterSystemPrompt, buildFileContext } from "@/lib/prompts";
import { getChildDocuments, getSecondDraftChild } from "@/lib/document-utils";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Document, CaseFile, FactItem, Attachment } from "@/lib/types";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensForDoc, limitSignalMetadata } from "@/lib/token-limits";
import { saveDocumentRevision } from "@/lib/document-persistence";

// Legal doc edits can be slow on a long document — same ceiling as the wizard route.
export const maxDuration = 300;

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const MODEL = "claude-sonnet-4-6";

/**
 * Andrew's "junior associate" chat: an ongoing, targeted-edit conversation
 * against the canonical attorney revision. It only proposes before/after
 * changes; accepting and saving those proposals is a separate explicit action.
 */
type PartnerMessage = { id?: string; role: "user" | "assistant"; content: string; created_at?: string };

/**
 * #124: serves the persisted partner thread so a reload restores it. Restored
 * here after #118's merge of this file dropped it — the review page fetches
 * this on mount and would otherwise get a 405 and show an empty conversation.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  const { data } = await db
    .from("attorney_document_messages")
    .select("id, role, content, created_at")
    .eq("document_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ messages: (data ?? []) as PartnerMessage[] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
    currentText?: string;
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
  // The browser's editor model may contain not-yet-debounced manual changes.
  // It is safe to use as proposal context because this endpoint never writes it.
  const baseText = typeof body.currentText === "string" && body.currentText.trim()
    ? body.currentText
    : existingChild?.draft_text ?? parent.draft_text;

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
          text: `${fileContext}\n\n---DOCUMENT BEING EDITED---\n${baseText}\n---END DOCUMENT---\n\nReturn ONLY valid JSON in this shape: {"message":"short explanation","changes":[{"before":"exact text copied from the document","after":"replacement text","summary":"short label"}]}. Each before string must occur verbatim in the document. Propose focused replacements; do not return or rewrite the whole document unless explicitly asked.`,
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

  let proposal: { message?: string; changes?: Array<{ before?: string; after?: string; summary?: string }> };
  try {
    const json = fullResponse.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    proposal = JSON.parse(json);
  } catch {
    return NextResponse.json({ error: "The partner did not return a usable change set. Please try again." }, { status: 502 });
  }
  const changes = (proposal.changes ?? []).filter((change) =>
    typeof change.before === "string" && change.before.length > 0 &&
    typeof change.after === "string" && baseText.includes(change.before)
  ).map((change, index) => ({ id: `${Date.now()}-${index}`, before: change.before!, after: change.after!, summary: change.summary?.trim() || "Proposed edit" }));
  if (!changes.length) return NextResponse.json({ error: "No applicable changes were proposed. Try describing the passage more precisely." }, { status: 422 });

  // #118 auto-merged a saveDocumentRevision write-through here. Dropped: this
  // route proposes and never writes, so serviceDb/draftText/childId do not
  // exist on this path. The document write — and therefore the Living File
  // sync #118 wants to make durable — happens when the attorney accepts a
  // change, not when the partner suggests one.

  recordAiFromMessage(db, message, {
    userId: parent.user_id,
    actorId: userId,
    caseFileId: parent.case_file_id,
    feature: "attorney_chat_edit",
    metadata: {
      document_id: existingChild?.id ?? parent.id,
      ...limitSignalMetadata({
        model: message.model,
        outputTokens: message.usage.output_tokens,
        priorLimit: 8000,
        stopReason: message.stop_reason,
      }),
    },
  }).catch((e) => console.error("[attorney/chat-edit] usage record error:", e));

  // #124's persisted transcript, restored: #118's merge of this file dropped it.
  // Failures are logged, not surfaced — the proposals are already computed, and
  // losing a transcript row should not cost the attorney the response.
  const partnerReply = proposal.message?.trim() || `${changes.length} change${changes.length === 1 ? "" : "s"} proposed.`;
  const lastAttorneyTurn = [...body.messages].reverse().find((m) => m.role === "user");
  const { error: transcriptError } = await createServiceClient()
    .from("attorney_document_messages")
    .insert([
      ...(lastAttorneyTurn
        ? [{ document_id: parent.id, attorney_id: userId, role: "user", content: lastAttorneyTurn.content }]
        : []),
      { document_id: parent.id, attorney_id: userId, role: "assistant", content: partnerReply },
    ]);
  if (transcriptError) {
    console.error("[attorney/chat-edit] transcript persist error:", transcriptError.message);
  }

  return NextResponse.json({
    message: partnerReply,
    changes,
    truncated,
    // No livingFileSyncPending here: #118 reported it from the write this route
    // used to perform, and this route no longer writes. The sync status belongs
    // to the accept path that actually persists the change.
  });
}
