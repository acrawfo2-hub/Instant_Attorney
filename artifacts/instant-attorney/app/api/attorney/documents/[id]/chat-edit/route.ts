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
import {
  ASSOCIATE_TOOLS,
  dispatchAssociateTool,
  runAssociateShortcut,
  shortcutById,
} from "@/lib/associate-tools";

// Legal doc edits can be slow on a long document — same ceiling as regenerate.
export const maxDuration = 300;

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const MODEL = "claude-sonnet-4-6";

const MAX_TOOL_ITERATIONS = 4;

/**
 * Junior associate chat against the attorney working copy. The review page
 * applies returned changes on arrival and autosaves through /revision — this
 * route never writes document text. Empty changes are valid (nothing to fix).
 * Specialists are existing review/QA services; the associate may call them.
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
    shortcut?: string;
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
  const toolCtx = { documentId: parent.id, caseFileId: parent.case_file_id };
  const shortcut = shortcutById(body.shortcut);
  let shortcutResult: string | null = null;
  if (shortcut) {
    shortcutResult = await runAssociateShortcut(shortcut.id, toolCtx, db);
  }

  const associateGuidance =
    `You are the junior associate on this working copy. Discuss AND fix in the same turn when you find a problem — do not wait for a second "please edit that" unless nothing is actually wrong. ` +
    `The attorney sees your replacements land immediately; the client sees nothing until they approve. Undo is revision history. ` +
    `Call specialist tools when a review, QA, placeholder, formatting, or authorities pass would help. Those write canonical findings, not document text. After a tool returns, fix the dangerous issues in this turn when you have enough to rewrite. ` +
    `Never approve, waive, send, or invent a citation. Empty changes[] is allowed when there is genuinely nothing to rewrite.\n\n` +
    `${fileContext}\n\n---DOCUMENT BEING EDITED---\n${baseText}\n---END DOCUMENT---\n` +
    (shortcutResult ? `\n---SPECIALIST RESULT (already run from the attorney's shortcut)---\n${shortcutResult}\n---END SPECIALIST RESULT---\n` : "") +
    `\nReturn ONLY valid JSON in this shape: {"message":"short explanation of what you found and what you changed","changes":[{"before":"exact text copied from the document","after":"replacement text","summary":"short label"}]}. ` +
    `Each before string must occur verbatim in the document. Focused replacements only; do not rewrite the whole document unless explicitly asked. changes may be [].`;

  let message: Anthropic.Message | null = null;
  let fullResponse = "";
  let usedTools = Boolean(shortcutResult);
  try {
    const loopMessages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: maxOutputTokensForDoc(MODEL, parent.doc_type),
        system: [
          {
            type: "text" as const,
            text: buildDrafterSystemPrompt("attorney"),
            cache_control: { type: "ephemeral" as const },
          },
          { type: "text" as const, text: associateGuidance },
        ],
        tools: ASSOCIATE_TOOLS,
        messages: loopMessages,
      });
      message = await stream.finalMessage();
      const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (!toolUses.length) {
        fullResponse = text;
        break;
      }
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const result = await dispatchAssociateTool(
          use.name,
          (use.input ?? {}) as Record<string, unknown>,
          toolCtx,
          db,
        );
        toolResults.push({ type: "tool_result", tool_use_id: use.id, content: result });
        usedTools = true;
      }
      loopMessages.push({ role: "assistant", content: message.content });
      loopMessages.push({ role: "user", content: toolResults });
      fullResponse = text;
    }
  } catch (err) {
    console.error("[attorney/chat-edit] Anthropic error:", err);
    return NextResponse.json(
      { error: "We couldn't work that turn just now. Please try again in a moment." },
      { status: 502 }
    );
  }

  if (!message) {
    return NextResponse.json({ error: "We couldn't work that turn just now. Please try again in a moment." }, { status: 502 });
  }

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
    proposal = { message: fullResponse.trim() || "I looked at the draft.", changes: [] };
  }
  const changes = (proposal.changes ?? []).filter((change) =>
    typeof change.before === "string" && change.before.length > 0 &&
    typeof change.after === "string" && baseText.includes(change.before)
  ).map((change, index) => ({ id: `${Date.now()}-${index}`, before: change.before!, after: change.after!, summary: change.summary?.trim() || "Edit" }));

  // This route still does not write, and that is deliberate — but the reason
  // changed, so read this before "fixing" it.
  //
  // The change set is applied by the review page the moment it arrives, then
  // autosaved through /api/attorney/documents/[id]/revision, which is the one
  // attorney write path and already carries saveDocumentRevision: a revision id,
  // an immutable document_revisions row, and the durable Living File sync. There
  // is nothing here for a second write to add, and adding one would give the
  // working copy two writers racing on the same text while the attorney types.
  //
  // What is gone is the accept step, not the revision trail. The attorney's undo
  // is the revision history, and the working copy stays privileged until it is
  // approved (see work-product.test.ts).

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
  const partnerReply = proposal.message?.trim()
    || (changes.length ? `${changes.length} change${changes.length === 1 ? "" : "s"} applied.` : "Nothing to change in the draft.");
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
    refreshWorkbench: usedTools,
  });
}
