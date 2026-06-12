import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DRAFTER_SYSTEM_PROMPT, WIZARD_FIELD_HINTS, buildFileContext } from "@/lib/prompts";
import { parseAndUpdateFile, extractDraftText } from "@/lib/file-parser";
import { findReusableDocument } from "@/lib/document-utils";
import { BYPASS_USER_ID, WIZARD_LABELS } from "@/lib/types";
import type { WizardType, CaseFile, FactItem, Attachment, RequestedAttachment } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { messages, caseFileId, wizardType, documentId } = await req.json();

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
  const systemPrompt = `${fileContext}\n\nDocument being drafted: ${WIZARD_LABELS[wizardType as WizardType]}\n${fieldHints}\n\n${DRAFTER_SYSTEM_PROMPT}`;

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 3500,
    system: systemPrompt,
    messages: sanitizedMessages,
  });

  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullResponse += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      }

      // After stream: update the document record with latest draft text
      const draftText = extractDraftText(fullResponse);

      if (draftText) {
        const label = WIZARD_LABELS[wizardType as WizardType] ?? wizardType;
        const now = new Date().toISOString();
        const docData = {
          draft_text: draftText,
          status: "draft",
          updated_at: now,
        };

        let savedDocId = documentId as string | undefined;

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
              title: `${label} — ${new Date().toLocaleDateString()}`,
              content_json: {},
              ...docData,
            })
            .select("id")
            .single();

          savedDocId = inserted?.id;
        }

        if (savedDocId) {
          controller.enqueue(encoder.encode(`\x00DOC:${savedDocId}\x00`));
        }
      }

      // Update the Living File if drafter produced a FILE UPDATE block
      if (fullResponse.includes("---FILE UPDATE---")) {
        try {
          await parseAndUpdateFile(db, caseFileId, userId, fullResponse);
        } catch (parseErr) {
          console.error("[wizard] file parser error:", parseErr);
        }
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
