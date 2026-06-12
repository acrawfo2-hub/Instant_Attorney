import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildDocReviewUserMessage, DOC_REVIEW_SYSTEM_PROMPT } from "@/lib/prompts";
import { upsertCriticalReviewChild } from "@/lib/document-utils";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Document, CaseFile, FactItem, Attachment } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [
        {
          type: "text" as const,
          text: DOC_REVIEW_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const reviewReport = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const child = await upsertCriticalReviewChild(db, doc as Document, reviewReport);

    await db.from("documents").update({
      review_status: "review_ready",
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({
      review_report: reviewReport,
      critical_review_document_id: child?.id ?? null,
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
