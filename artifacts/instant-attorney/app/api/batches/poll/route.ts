import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { upsertCriticalReviewChild } from "@/lib/document-utils";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { logTruncation } from "@/lib/truncation-logger";
import { limitSignalMetadata } from "@/lib/token-limits";
import type { Document } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
/** Anthropic Message Batches API list-price discount */
const BATCH_COST_MULTIPLIER = 0.5;

// Secured by CRON_SECRET — set in Vercel project env vars and matched by vercel.json cron header
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createServiceClient();
  const results = {
    review: { checked: 0, completed: 0, errors: 0 },
  };

  // ── Auto-review batch jobs ────────────────────────────────────────────────
  const { data: pendingReview } = await db
    .from("documents")
    .select("*")
    .eq("review_status", "reviewing")
    .is("parent_document_id", null)
    .limit(50);

  const reviewDocs = (pendingReview ?? []).filter(
    (d) => typeof (d.content_json as Record<string, unknown>)?.review_batch_job_id === "string"
  );

  for (const doc of reviewDocs) {
    results.review.checked++;
    const batchId = (doc.content_json as Record<string, string>).review_batch_job_id;
    try {
      const batch = await anthropic.messages.batches.retrieve(batchId);
      if (batch.processing_status !== "ended") continue;

      for await (const result of await anthropic.messages.batches.results(batchId)) {
        if (result.result.type !== "succeeded") {
          results.review.errors++;
          const cj = { ...(doc.content_json as Record<string, unknown> ?? {}) };
          delete cj.review_batch_job_id;
          await db.from("documents").update({
            review_status: null,
            content_json: cj,
            updated_at: new Date().toISOString(),
          }).eq("id", doc.id);
          continue;
        }

        const reviewReport = result.result.message.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        const reviewTruncated = result.result.message.stop_reason === "max_tokens";
        if (reviewTruncated) {
          logTruncation({
            endpoint: "batches/poll/review",
            feature: "auto_critical_review",
            documentId: doc.id,
            caseFileId: doc.case_file_id,
            userId: doc.user_id,
            outputTokens: result.result.message.usage.output_tokens,
          });
        }

        await recordAiFromMessage(db, result.result.message, {
          userId: doc.user_id,
          actorId: null,
          caseFileId: doc.case_file_id,
          feature: "auto_critical_review",
          costMultiplier: BATCH_COST_MULTIPLIER,
          metadata: {
            document_id: doc.id,
            batch_id: batchId,
            ...limitSignalMetadata({
              model: result.result.message.model,
              outputTokens: result.result.message.usage.output_tokens,
              priorLimit: 8000,
              stopReason: result.result.message.stop_reason,
            }),
          },
        });

        await upsertCriticalReviewChild(db, doc as unknown as Document, reviewReport);

        const cj: Record<string, unknown> = { ...(doc.content_json as Record<string, unknown> ?? {}), ...(reviewTruncated ? { truncated: true } : {}) };
        delete cj.review_batch_job_id;
        await db.from("documents").update({
          review_status: "review_ready",
          content_json: cj,
          updated_at: new Date().toISOString(),
        }).eq("id", doc.id);

        results.review.completed++;
        console.log(`[batch-poll] Auto-review complete for doc ${doc.id}${reviewTruncated ? " (truncated)" : ""}`);
      }
    } catch (err) {
      results.review.errors++;
      console.error(`[batch-poll] Review error for doc ${doc.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, results });
}
