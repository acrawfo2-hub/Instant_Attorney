import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  DOCUMENT_TYPE_FITNESS_SYSTEM_PROMPT,
  SECOND_DRAFT_SYSTEM_PROMPT,
  buildDocumentTypeFitnessUserMessage,
  buildSecondDraftUserMessage,
  parseDocumentTypeFitness,
} from "@/lib/prompts";
import { getChildDocuments, upsertSecondDraftChild } from "@/lib/document-utils";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { BYPASS_USER_ID, docTypeLabel } from "@/lib/types";
import type { Document, CaseFile, FactItem, Attachment } from "@/lib/types";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";

// Two model calls (fitness + full second draft) — give the route room to finish.
export const maxDuration = 300;

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

const FITNESS_MODEL = "claude-haiku-4-5-20251001";
const SECOND_DRAFT_MODEL = "claude-opus-4-6";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { prompt?: string };
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

  const { data: parent } = await db
    .from("documents")
    .select("*")
    .eq("id", id)
    .is("parent_document_id", null)
    .single();

  if (!parent) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (!parent.draft_text?.trim()) {
    return NextResponse.json({ error: "Initial draft has no text to refine" }, { status: 400 });
  }

  const children = await getChildDocuments(db, id);
  const criticalReview = children.find((c) => c.doc_type === "critical_review");
  const criticalReviewText = criticalReview?.draft_text ?? parent.review_report;

  if (!criticalReviewText?.trim()) {
    return NextResponse.json(
      { error: "Run a critical review first before generating a second draft" },
      { status: 400 }
    );
  }

  const attorneyInstructions =
    (typeof body.prompt === "string" ? body.prompt : null) ??
    parent.attorney_second_draft_prompt ??
    "";

  if (typeof body.prompt === "string") {
    await db.from("documents").update({
      attorney_second_draft_prompt: body.prompt,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  }

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
  const parentDoc = parent as Document;

  await db.from("documents").update({
    review_status: "merging",
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  try {
    // Stream and assemble — non-streaming calls at our token ceilings are rejected
    // by the SDK ("Streaming is required…") before they reach the API.
    const fitnessResponse = await anthropic.messages.stream({
      model: FITNESS_MODEL,
      max_tokens: maxOutputTokensFor(FITNESS_MODEL),
      system: [
        {
          type: "text" as const,
          text: DOCUMENT_TYPE_FITNESS_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{
        role: "user",
        content: buildDocumentTypeFitnessUserMessage(parentDoc, caseFile, facts, attachments),
      }],
    }).finalMessage();

    const fitnessText = fitnessResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    await recordAiFromMessage(db, fitnessResponse, {
      userId: parentDoc.user_id,
      actorId: userId,
      caseFileId: parentDoc.case_file_id,
      feature: "attorney_second_draft_fitness",
      metadata: {
        document_id: id,
        ...limitSignalMetadata({
          model: fitnessResponse.model,
          outputTokens: fitnessResponse.usage.output_tokens,
          priorLimit: 600,
          stopReason: fitnessResponse.stop_reason,
        }),
      },
    });

    const fitness = parseDocumentTypeFitness(fitnessText);

    if (!fitness.fit) {
      await db.from("documents").update({
        review_status: "review_ready",
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      return NextResponse.json(
        {
          error: "Document type may not be appropriate for this matter",
          fitness,
          document_type: docTypeLabel(parentDoc.doc_type),
        },
        { status: 422 }
      );
    }

    const draftResponse = await anthropic.messages.stream({
      model: SECOND_DRAFT_MODEL,
      max_tokens: maxOutputTokensFor(SECOND_DRAFT_MODEL),
      system: [
        {
          type: "text" as const,
          text: SECOND_DRAFT_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{
        role: "user",
        content: buildSecondDraftUserMessage(
          parentDoc,
          criticalReviewText,
          attorneyInstructions,
          caseFile,
          facts,
          attachments
        ),
      }],
    }).finalMessage();

    const secondDraftText = draftResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    await recordAiFromMessage(db, draftResponse, {
      userId: parentDoc.user_id,
      actorId: userId,
      caseFileId: parentDoc.case_file_id,
      feature: "attorney_second_draft",
      metadata: {
        document_id: id,
        ...limitSignalMetadata({
          model: draftResponse.model,
          outputTokens: draftResponse.usage.output_tokens,
          priorLimit: 8000,
          stopReason: draftResponse.stop_reason,
        }),
      },
    });

    const truncated = draftResponse.stop_reason === "max_tokens";
    if (truncated) {
      logTruncation({
        endpoint: "attorney/second-draft",
        feature: "attorney_second_draft",
        documentId: id,
        caseFileId: parentDoc.case_file_id,
        userId: parentDoc.user_id,
        outputTokens: draftResponse.usage.output_tokens,
      });
    }

    // Only throw on a truly empty (non-truncated) response — truncated partial output is valid
    if (!secondDraftText && !truncated) {
      throw new Error("Empty second draft response");
    }

    const child = await upsertSecondDraftChild(db, parentDoc, secondDraftText);

    const existingCj = (parentDoc.content_json as Record<string, unknown>) ?? {};
    await db.from("documents").update({
      review_status: "merged",
      content_json: truncated ? { ...existingCj, truncated: true } : existingCj,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({
      success: true,
      fitness,
      second_draft_document_id: child?.id ?? null,
      improved_draft_text: secondDraftText,
      truncated,
    });
  } catch (err) {
    console.error("[attorney/second-draft] error:", err);
    await db.from("documents").update({
      review_status: "review_ready",
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ error: "Second draft generation failed" }, { status: 500 });
  }
}
