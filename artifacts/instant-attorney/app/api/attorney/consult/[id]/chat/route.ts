import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";
import { buildFileContext } from "@/lib/prompts";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";
import { mergeWrapUpPatch, normalizeWrapUp } from "@/lib/consult-wrap-up";
import {
  CONSULT_ASSOCIATE_TOOLS,
  dispatchConsultAssociateTool,
  runConsultAssociateShortcut,
} from "@/lib/consult-associate-tools";
import { consultShortcutById } from "@/lib/consult-shortcuts";
import type { Attachment, CaseFile, ConsultRequest, ConsultWrapUp, FactItem } from "@/lib/types";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 4;

type PartnerMessage = { id?: string; role: "user" | "assistant"; content: string; created_at?: string };

/**
 * Junior associate chat against a consult. The workbench applies returned
 * wrap-up / fee patches on arrival through the existing persist routes — this
 * route never writes wrap_up_draft, never submits wrap-up, and never starts
 * or ends the session. Specialists are the existing consult services.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const { data } = await viewer.db
    .from("attorney_consult_messages")
    .select("id, role, content, created_at")
    .eq("consult_request_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ messages: (data ?? []) as PartnerMessage[] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
    currentWrapUp?: unknown;
    shortcut?: string;
  };

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  const { data: consultRow } = await viewer.db.from("consult_requests").select("*").eq("id", id).single();
  if (!consultRow) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  const consult = consultRow as ConsultRequest;
  if (!consult.case_file_id) {
    return NextResponse.json({ error: "Link a case file before talking to the associate" }, { status: 400 });
  }

  const [{ data: caseFileRow }, { data: factRows }, { data: attRows }] = await Promise.all([
    viewer.db.from("case_files").select("*").eq("id", consult.case_file_id).single(),
    viewer.db.from("fact_items").select("*").eq("case_file_id", consult.case_file_id),
    viewer.db.from("attachments").select("*").eq("case_file_id", consult.case_file_id).eq("status", "ready"),
  ]);
  if (!caseFileRow) return NextResponse.json({ error: "Case file not found" }, { status: 404 });

  const caseFile = caseFileRow as CaseFile;
  const fileContext = buildFileContext(caseFile, (factRows ?? []) as FactItem[], (attRows ?? []) as Attachment[]);
  const currentWrapUp = normalizeWrapUp(consult.wrap_up_draft);
  const toolCtx = { consultId: consult.id, actorId: viewer.userId };
  const shortcut = consultShortcutById(body.shortcut);
  let shortcutResult: string | null = null;
  if (shortcut) {
    shortcutResult = await runConsultAssociateShortcut(shortcut.id, toolCtx, viewer.db);
  }

  const associateGuidance =
    `You are the junior associate on this consult. Discuss AND update the working closeout draft in the same turn when you find something to write — do not wait for a second "please draft that" unless nothing is actually ready. ` +
    `The attorney sees wrap-up and fee patches land immediately; the client sees nothing until they send the closeout. ` +
    `Call specialist tools for the brief, fee estimate, closeout draft, or pre-consult memo. Those are the existing services. After a tool returns, put a wrapUp object in your JSON when you have a draft the attorney should keep. ` +
    `Never start or end the session. Never submit or send the wrap-up. Never invent a fee quote. Empty wrapUp is allowed when there is genuinely nothing to write.\n\n` +
    `${fileContext}\n\n---CURRENT CLOSEOUT DRAFT---\n${JSON.stringify(currentWrapUp)}\n---END CLOSEOUT DRAFT---\n` +
    (shortcutResult ? `\n---SPECIALIST RESULT (already run from the attorney's shortcut)---\n${shortcutResult}\n---END SPECIALIST RESULT---\n` : "") +
    `\nReturn ONLY valid JSON in this shape: {"message":"short explanation","wrapUp":null-or-object,"feeDraft":null-or-object}. ` +
    `wrapUp matches the closeout fields (consultSummary, strategyOverview, disposition, referralNotes, expectedTimeline, expectedDocuments, clientActions, attorneyActions). ` +
    `feeDraft may include selectedPackageId and attorneyNotes from the fee estimate. Both may be omitted.`;

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
        max_tokens: maxOutputTokensFor(MODEL),
        system: [{ type: "text" as const, text: associateGuidance }],
        tools: CONSULT_ASSOCIATE_TOOLS,
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
        const result = await dispatchConsultAssociateTool(use.name, toolCtx, viewer.db);
        toolResults.push({ type: "tool_result", tool_use_id: use.id, content: result });
        usedTools = true;
      }
      loopMessages.push({ role: "assistant", content: message.content });
      loopMessages.push({ role: "user", content: toolResults });
      fullResponse = text;
    }
  } catch (err) {
    console.error("[attorney/consult/chat] Anthropic error:", err);
    return NextResponse.json(
      { error: "We couldn't work that turn just now. Please try again in a moment." },
      { status: 502 },
    );
  }

  if (!message) {
    return NextResponse.json({ error: "We couldn't work that turn just now. Please try again in a moment." }, { status: 502 });
  }

  if (message.stop_reason === "max_tokens") {
    logTruncation({
      endpoint: "attorney/consult/chat",
      feature: "attorney_consult_associate",
      caseFileId: consult.case_file_id,
      userId: consult.user_id,
      outputTokens: message.usage.output_tokens,
    });
  }

  let proposal: { message?: string; wrapUp?: unknown; feeDraft?: unknown };
  try {
    const json = fullResponse.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    proposal = JSON.parse(json);
  } catch {
    proposal = { message: fullResponse.trim() || "I looked at the consult.", wrapUp: undefined };
  }

  const wrapUp: ConsultWrapUp | null = proposal.wrapUp
    ? mergeWrapUpPatch(currentWrapUp, proposal.wrapUp)
    : null;
  const feeDraft = proposal.feeDraft && typeof proposal.feeDraft === "object"
    ? proposal.feeDraft as Record<string, unknown>
    : null;

  recordAiFromMessage(viewer.db, message, {
    userId: consult.user_id,
    actorId: viewer.userId,
    caseFileId: consult.case_file_id,
    feature: "attorney_consult_associate",
    metadata: {
      consult_id: consult.id,
      ...limitSignalMetadata({
        model: message.model,
        outputTokens: message.usage.output_tokens,
        priorLimit: 4000,
        stopReason: message.stop_reason,
      }),
    },
  }).catch((e) => console.error("[attorney/consult/chat] usage record error:", e));

  const partnerReply = proposal.message?.trim()
    || (wrapUp ? "Closeout draft updated." : "Nothing to change on the closeout.");
  const lastAttorneyTurn = [...body.messages].reverse().find((m) => m.role === "user");
  const { error: transcriptError } = await viewer.db
    .from("attorney_consult_messages")
    .insert([
      ...(lastAttorneyTurn
        ? [{ consult_request_id: consult.id, attorney_id: viewer.userId, role: "user", content: lastAttorneyTurn.content }]
        : []),
      { consult_request_id: consult.id, attorney_id: viewer.userId, role: "assistant", content: partnerReply },
    ]);
  if (transcriptError) {
    console.error("[attorney/consult/chat] transcript persist error:", transcriptError.message);
  }

  return NextResponse.json({
    message: partnerReply,
    wrapUp,
    feeDraft,
    truncated: message.stop_reason === "max_tokens",
    refreshWorkbench: usedTools,
  });
}
