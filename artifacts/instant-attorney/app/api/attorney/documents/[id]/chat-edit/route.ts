import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildAttorneyFreestylePrompt, buildFileContext, ATTORNEY_TOOLS_GUIDANCE } from "@/lib/prompts";
import { getChildDocuments, getSecondDraftChild } from "@/lib/document-utils";
import { READ_ONLY_TOOLS, dispatchTool } from "@/lib/orchestrator-tools";
import { detectAcpAreasFromContext } from "@/lib/acp-area-router";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { maxOutputTokensForDoc, limitSignalMetadata } from "@/lib/token-limits";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Attachment, CaseFile, Document, FactItem, RequestedAttachment } from "@/lib/types";

export const maxDuration = 300;
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 5;
const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

type PartnerMessage = { id?: string; role: "user" | "assistant"; content: string; created_at?: string };

async function attorneySession() {
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();
  let attorneyId = BYPASS_USER_ID;
  if (!BYPASS_AUTH) {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return null;
    attorneyId = user.id;
  }
  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", attorneyId).single();
  return profile?.is_attorney ? { db, attorneyId } : null;
}

async function loadDocument(db: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createServiceClient>, id: string) {
  const { data } = await db.from("documents").select("*").eq("id", id).is("parent_document_id", null).single();
  if (!data) return null;
  const parent = data as Document;
  const revision = getSecondDraftChild(await getChildDocuments(db, id)) ?? parent;
  return { parent, revision };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await attorneySession();
  if (!session) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  const { id } = await params;
  const docs = await loadDocument(session.db, id);
  if (!docs) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const { data, error } = await session.db.from("attorney_document_messages")
    .select("id, role, content, created_at")
    .eq("document_id", id).eq("case_file_id", docs.parent.case_file_id)
    .eq("attorney_id", session.attorneyId).eq("working_revision_id", docs.revision.id)
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) return NextResponse.json({ error: "Conversation history could not be loaded" }, { status: 500 });
  return NextResponse.json({ messages: data ?? [], workingRevisionId: docs.revision.id });
}

function proposedPatch(text: string) {
  const match = text.match(/---PROPOSED DOCUMENT PATCH---\s*([\s\S]*?)\s*---END PROPOSED DOCUMENT PATCH---/i);
  return match?.[1]?.trim() || null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { message?: string; workingRevisionId?: string; applyPatch?: boolean };
  const userText = body.message?.trim();
  if (!userText || !body.workingRevisionId) return NextResponse.json({ error: "message and workingRevisionId required" }, { status: 400 });
  const session = await attorneySession();
  if (!session) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  const docs = await loadDocument(session.db, id);
  if (!docs) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (docs.revision.id !== body.workingRevisionId) {
    return NextResponse.json({ error: "The working revision changed. Reloading the conversation is required." }, { status: 409 });
  }

  const { parent, revision } = docs;
  const [{ data: caseRow }, { data: facts }, { data: attachments }, { data: requested }, { data: comments },
    { data: improvements }, { data: citations }, { data: reviewRuns }, { data: history }] = await Promise.all([
    session.db.from("case_files").select("*").eq("id", parent.case_file_id).single(),
    session.db.from("fact_items").select("*").eq("case_file_id", parent.case_file_id),
    session.db.from("attachments").select("*").eq("case_file_id", parent.case_file_id).eq("status", "ready"),
    session.db.from("requested_attachments").select("*").eq("case_file_id", parent.case_file_id),
    session.db.from("document_comments").select("body, created_at").eq("document_id", id).eq("resolved", false),
    session.db.from("document_improvements").select("section, kind, severity, title, rationale, proposed_change, status").eq("document_id", id).neq("status", "superseded"),
    session.db.from("document_qa_citations").select("raw, claim, verdict, evidence, waived").eq("document_id", id),
    session.db.from("document_review_runs").select("status, stage, error, completed_at").eq("document_id", id).order("created_at", { ascending: false }).limit(1),
    session.db.from("attorney_document_messages").select("role, content").eq("document_id", id)
      .eq("case_file_id", parent.case_file_id).eq("attorney_id", session.attorneyId)
      .eq("working_revision_id", revision.id).order("created_at", { ascending: true }).order("id", { ascending: true }),
  ]);
  if (!caseRow) return NextResponse.json({ error: "Case file not found" }, { status: 404 });

  const caseFile = caseRow as CaseFile;
  const conversation = [...(history ?? []) as PartnerMessage[], { role: "user" as const, content: userText }];
  const fileContext = buildFileContext(caseFile, (facts ?? []) as FactItem[], (attachments ?? []) as Attachment[], (requested ?? []) as RequestedAttachment[]);
  const reviewContext = JSON.stringify({
    clientCoverSheet: parent.content_json,
    openComments: comments ?? [], reviewImprovements: improvements ?? [],
    qaResults: { latestRun: reviewRuns?.[0] ?? null, citations: citations ?? [] },
  }, null, 2);
  const system = [
    { type: "text" as const, text: buildAttorneyFreestylePrompt(detectAcpAreasFromContext(conversation, caseFile)), cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: `${fileContext}\n\n---ACTIVE WORKING REVISION (${revision.id})---\n${revision.draft_text ?? ""}\n---END ACTIVE WORKING REVISION---\n\n---DOCUMENT REVIEW CONTEXT---\n${reviewContext}` },
    { type: "text" as const, text: `You are the attorney's document partner. Answer with analysis, questions, options, or alternative language as appropriate. Do not rewrite or mutate the document unless explicitly asked for a complete replacement. If proposing a complete patch, put only that draft between ---PROPOSED DOCUMENT PATCH--- and ---END PROPOSED DOCUMENT PATCH---. A proposal is not applied unless the request explicitly asks to apply it.\n\n${ATTORNEY_TOOLS_GUIDANCE}` },
  ];

  const { data: savedUser, error: userError } = await session.db.from("attorney_document_messages").insert({
    document_id: id, case_file_id: parent.case_file_id, attorney_id: session.attorneyId,
    working_revision_id: revision.id, role: "user", content: userText,
  }).select("id, role, content, created_at").single();
  if (userError) return NextResponse.json({ error: "Your message could not be saved" }, { status: 500 });

  let finalMessage: Anthropic.Message | null = null;
  let fullResponse = "";
  const loopMessages: Anthropic.MessageParam[] = conversation.map((m) => ({ role: m.role, content: m.content }));
  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      finalMessage = await anthropic.messages.create({ model: MODEL, max_tokens: maxOutputTokensForDoc(MODEL, parent.doc_type), system, messages: loopMessages, tools: READ_ONLY_TOOLS });
      fullResponse += finalMessage.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      if (finalMessage.stop_reason !== "tool_use") break;
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tool of finalMessage.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")) {
        const output = await dispatchTool(tool.name, tool.input, { db: session.db, userId: session.attorneyId, caseFileId: parent.case_file_id });
        results.push({ type: "tool_result", tool_use_id: tool.id, content: output.forModel });
        createServiceClient().from("orchestrator_tool_calls").insert({ case_file_id: parent.case_file_id, user_id: session.attorneyId, tool_name: tool.name, input: tool.input, result: output.raw ?? null }).then(undefined, console.error);
      }
      loopMessages.push({ role: "assistant", content: finalMessage.content }, { role: "user", content: results });
    }
  } catch (error) {
    console.error("[document-partner] model error", error);
    return NextResponse.json({ error: "The partner could not respond just now. Your message was saved; please retry." }, { status: 502 });
  }

  const patch = proposedPatch(fullResponse);
  let patchApplied = false;
  if (body.applyPatch && patch) {
    const { data: updated } = await createServiceClient().from("documents").update({ draft_text: patch, updated_at: new Date().toISOString() })
      .eq("id", revision.id).eq("draft_text", revision.draft_text ?? "").select("id");
    patchApplied = Boolean(updated?.length);
    if (patchApplied && revision.id !== parent.id) await createServiceClient().from("documents").update({ improved_draft_text: patch, updated_at: new Date().toISOString() }).eq("id", parent.id);
  }
  const { data: savedAssistant, error: assistantError } = await session.db.from("attorney_document_messages").insert({
    document_id: id, case_file_id: parent.case_file_id, attorney_id: session.attorneyId, working_revision_id: revision.id,
    role: "assistant", content: fullResponse, proposed_patch: patch, patch_applied: patchApplied,
  }).select("id, role, content, created_at").single();
  if (assistantError) return NextResponse.json({ error: "The response was generated but could not be saved" }, { status: 500 });
  if (finalMessage) recordAiFromMessage(session.db, finalMessage, { userId: parent.user_id, actorId: session.attorneyId, caseFileId: parent.case_file_id, feature: "attorney_document_partner", metadata: { document_id: revision.id, ...limitSignalMetadata({ model: finalMessage.model, outputTokens: finalMessage.usage.output_tokens, priorLimit: 8000, stopReason: finalMessage.stop_reason }) } }).catch(console.error);
  return NextResponse.json({ userMessage: savedUser, assistantMessage: savedAssistant, proposedPatch: patch, patchApplied, workingRevisionId: revision.id });
}
