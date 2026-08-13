import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  DOCUMENT_TYPE_FITNESS_SYSTEM_PROMPT,
  SECOND_DRAFT_SYSTEM_PROMPT,
  buildDocumentTypeFitnessUserMessage,
  buildSecondDraftUserMessage,
  parseDocumentTypeFitness,
  parseSecondDraft,
} from "@/lib/prompts";
import { getChildDocuments, upsertSecondDraftChild } from "@/lib/document-utils";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { BYPASS_USER_ID, docTypeLabel } from "@/lib/types";
import type { Document, CaseFile, FactItem, Attachment } from "@/lib/types";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensFor, maxOutputTokensForDoc, limitSignalMetadata } from "@/lib/token-limits";

// Two model calls (fitness + full second draft) — give the route room to finish.
export const maxDuration = 300;

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

const FITNESS_MODEL = "claude-haiku-4-5-20251001";
const SECOND_DRAFT_MODEL = "claude-opus-4-8";

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

  const freeTextInstructions =
    (typeof body.prompt === "string" ? body.prompt : null) ??
    parent.attorney_second_draft_prompt ??
    "";

  if (typeof body.prompt === "string") {
    await db.from("documents").update({
      attorney_second_draft_prompt: body.prompt,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  }

  // Fold the attorney's open (unresolved) comments & concerns into the revision
  // instructions. These live in document_comments rather than the free-text
  // prompt, so they accumulate across review passes without overwriting the
  // saved prompt. Resolved comments are intentionally excluded.
  const { data: openComments } = await db
    .from("document_comments")
    .select("body, created_at")
    .eq("document_id", id)
    .eq("resolved", false)
    .order("created_at", { ascending: true });

  const commentsBlock = (openComments ?? [])
    .map((c, i) => `${i + 1}. ${c.body}`)
    .join("\n");

  const attorneyInstructions = [
    freeTextInstructions.trim(),
    commentsBlock
      ? `COMMENTS & CONCERNS TO ADDRESS:\n${commentsBlock}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

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

  // Generation runs two model calls (Haiku fitness + Opus second draft) and can
  // take minutes. We previously awaited everything before returning a single JSON
  // response, which left the client↔server connection idle the whole time — an
  // intermediate proxy then dropped it and the browser showed "Network error".
  // Instead we stream NDJSON: periodic heartbeats keep the connection alive while
  // the models run, and the final line carries the result. See client handler in
  // app/attorney/review/[id]/page.tsx.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* controller already closed */
        }
      };
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);
      // Emit one heartbeat immediately so the proxy sees bytes right away.
      send({ type: "heartbeat" });

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

          send({
            type: "fitness_reject",
            error: "Document type may not be appropriate for this matter",
            fitness,
            document_type: docTypeLabel(parentDoc.doc_type),
          });
          return;
        }

        const draftResponse = await anthropic.messages.stream({
          model: SECOND_DRAFT_MODEL,
          // Bound the expensive Opus output by the document type's expected
          // length rather than the full 64k model ceiling.
          max_tokens: maxOutputTokensForDoc(SECOND_DRAFT_MODEL, parentDoc.doc_type),
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

        const rawDraftOutput = draftResponse.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();

        // Split the client-facing document from the attorney-only changelog.
        const { draftText: secondDraftText, changes: secondDraftChanges } = parseSecondDraft(rawDraftOutput);

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

        // The second-draft child is owned by the CLIENT (parentDoc.user_id); write it
        // with the service client to bypass RLS now that the caller is a verified attorney.
        const saved = await upsertSecondDraftChild(createServiceClient(), parentDoc, secondDraftText, secondDraftChanges);
        if (!saved) throw new Error("Second draft could not be saved");
        const child = saved.document;

        const existingCj = (parentDoc.content_json as Record<string, unknown>) ?? {};
        await db.from("documents").update({
          review_status: "merged",
          content_json: truncated ? { ...existingCj, truncated: true } : existingCj,
          updated_at: new Date().toISOString(),
        }).eq("id", id);

        send({
          type: "result",
          success: true,
          fitness,
          second_draft_document_id: child?.id ?? null,
          improved_draft_text: secondDraftText,
          changes: secondDraftChanges,
          truncated,
          living_file_sync_pending: saved.syncPending,
        });
      } catch (err) {
        console.error("[attorney/second-draft] error:", err);
        await db.from("documents").update({
          review_status: "review_ready",
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        send({ type: "error", error: "Second draft generation failed" });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
