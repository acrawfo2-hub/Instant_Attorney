import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DRAFTER_SYSTEM_PROMPT, WIZARD_FIELD_HINTS, buildFileContext } from "@/lib/prompts";
import { parseAndUpdateFile, extractDraftText } from "@/lib/file-parser";
import { findReusableDocument } from "@/lib/document-utils";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { BYPASS_USER_ID, WIZARD_LABELS } from "@/lib/types";
import type { WizardType, CaseFile, FactItem, Attachment, RequestedAttachment } from "@/lib/types";

// Allow up to 5 minutes for this route — legal doc generation can be slow
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { messages, caseFileId, wizardType, documentId, instrument } = await req.json();

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
  }

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

  // Non-streaming call — works reliably through any proxy/deployment environment.
  // Streaming was silently dropped by Replit's production proxy, causing the wizard
  // to appear permanently stuck. This guarantees the response arrives.
  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3500,
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Anthropic API error";
    console.error("[wizard] Anthropic error:", msg);
    return NextResponse.json({ error: `AI generation failed: ${msg}` }, { status: 502 });
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
    metadata: { wizard_type: wizardType },
  }).catch((e) => console.error("[wizard] usage record error:", e));

  // Save the draft text to the documents table
  const draftText = extractDraftText(fullResponse);
  let savedDocId: string | undefined = documentId as string | undefined;

  if (draftText) {
    const now = new Date().toISOString();
    const docData = {
      draft_text: draftText,
      status: "draft",
      updated_at: now,
    };

    if (!savedDocId) {
      const existing = await findReusableDocument(db, caseFileId, wizardType, userId);
      savedDocId = existing?.id;
    }

    if (savedDocId) {
      await db.from("documents").update(docData).eq("id", savedDocId);
    } else {
      const { data: inserted } = await db
        .from("documents")
        .insert({
          case_file_id: caseFileId,
          user_id: userId,
          doc_type: wizardType,
          title: `${documentLabel} — ${new Date().toLocaleDateString()}`,
          content_json: { init_response: fullResponse },
          ...docData,
        })
        .select("id")
        .single();

      savedDocId = inserted?.id;
    }
  }

  // Update the Living File if the drafter produced a FILE UPDATE block
  if (fullResponse.includes("---FILE UPDATE---")) {
    try {
      await parseAndUpdateFile(db, caseFileId, userId, fullResponse);
    } catch (parseErr) {
      console.error("[wizard] file parser error:", parseErr);
    }
  }

  return NextResponse.json({
    text: fullResponse,
    documentId: savedDocId ?? null,
  });
}
