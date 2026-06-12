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
import { BYPASS_USER_ID, docTypeLabel } from "@/lib/types";
import type { Document, CaseFile, FactItem, Attachment } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    const fitnessResponse = await anthropic.messages.create({
      model: FITNESS_MODEL,
      max_tokens: 600,
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
    });

    const fitnessText = fitnessResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

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

    const draftResponse = await anthropic.messages.create({
      model: SECOND_DRAFT_MODEL,
      max_tokens: 8000,
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
    });

    const secondDraftText = draftResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!secondDraftText) {
      throw new Error("Empty second draft response");
    }

    const child = await upsertSecondDraftChild(db, parentDoc, secondDraftText);

    await db.from("documents").update({
      review_status: "merged",
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({
      success: true,
      fitness,
      second_draft_document_id: child?.id ?? null,
      improved_draft_text: secondDraftText,
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
