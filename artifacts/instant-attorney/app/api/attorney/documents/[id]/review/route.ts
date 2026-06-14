import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildDocReviewUserMessage, DOC_REVIEW_SYSTEM_PROMPT } from "@/lib/prompts";
import { upsertCriticalReviewChild } from "@/lib/document-utils";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Document, CaseFile, FactItem, Attachment } from "@/lib/types";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";

// Legal-document review can be slow — give the model room to finish.
export const maxDuration = 300;

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export async function POST(
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
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  const { data: doc } = await db
    .from("documents")
    .select("*")
    .eq("id", id)
    .is("parent_document_id", null)
    .single();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const [{ data: caseFileRow }, { data: factRows }, { data: attRows }] = await Promise.all([
    db.from("case_files").select("*").eq("id", doc.case_file_id).single(),
    db.from("fact_items").select("*").eq("case_file_id", doc.case_file_id),
    db.from("attachments").select("*").eq("case_file_id", doc.case_file_id).eq("status", "ready"),
  ]);

  if (!caseFileRow) return NextResponse.json({ error: "Case file not found" }, { status: 404 });

  await db.from("documents").update({
    review_status: "reviewing",
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  const userMessage = buildDocReviewUserMessage(
    doc as Document,
    caseFileRow as CaseFile,
    (factRows ?? []) as FactItem[],
    (attRows ?? []) as Attachment[]
  );

  try {
    // Stream server-side and assemble the final message. A non-streaming request
    // at our full 64k token ceiling is rejected by the SDK ("Streaming is
    // required…") before it leaves the server — the same failure that 502'd the
    // client wizard. Consuming the stream here keeps the JSON response contract.
    const response = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
      system: [
        {
          type: "text" as const,
          text: DOC_REVIEW_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    }).finalMessage();

    const reviewReport = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    await recordAiFromMessage(db, response, {
      userId: doc.user_id,
      actorId: userId,
      caseFileId: doc.case_file_id,
      feature: "attorney_review",
      metadata: {
        document_id: id,
        ...limitSignalMetadata({
          model: response.model,
          outputTokens: response.usage.output_tokens,
          priorLimit: 8000,
          stopReason: response.stop_reason,
        }),
      },
    });

    const truncated = response.stop_reason === "max_tokens";
    if (truncated) {
      logTruncation({
        endpoint: "attorney/review",
        feature: "attorney_review",
        documentId: id,
        caseFileId: doc.case_file_id,
        userId: doc.user_id,
        outputTokens: response.usage.output_tokens,
      });
    }

    const child = await upsertCriticalReviewChild(db, doc as Document, reviewReport);

    const existingCj = (doc.content_json as Record<string, unknown>) ?? {};
    await db.from("documents").update({
      review_status: "review_ready",
      content_json: truncated ? { ...existingCj, truncated: true } : existingCj,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({
      review_report: reviewReport,
      critical_review_document_id: child?.id ?? null,
      truncated,
    });
  } catch (err) {
    console.error("[attorney/review] error:", err);
    await db.from("documents").update({
      review_status: null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ error: "Review generation failed" }, { status: 500 });
  }
}
