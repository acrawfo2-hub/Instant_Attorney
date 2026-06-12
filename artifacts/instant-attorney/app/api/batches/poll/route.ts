import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { extractDraftText } from "@/lib/file-parser";
import { upsertCriticalReviewChild } from "@/lib/document-utils";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import type { Document } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney });
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
    preWarm: { checked: 0, completed: 0, errors: 0 },
    review: { checked: 0, completed: 0, errors: 0 },
  };

  // ── Pre-warm batch jobs ───────────────────────────────────────────────────
  const { data: pendingPreWarm } = await db
    .from("documents")
    .select("id, user_id, case_file_id, doc_type, content_json")
    .eq("status", "pre_warmed")
    .is("draft_text", null)
    .limit(50);

  const preWarmDocs = (pendingPreWarm ?? []).filter(
    (d) => typeof (d.content_json as Record<string, unknown>)?.batch_job_id === "string"
  );

  for (const doc of preWarmDocs) {
    results.preWarm.checked++;
    const batchId = (doc.content_json as Record<string, string>).batch_job_id;
    try {
      const batch = await anthropic.messages.batches.retrieve(batchId);
      if (batch.processing_status !== "ended") continue;

      for await (const result of await anthropic.messages.batches.results(batchId)) {
        if (result.result.type !== "succeeded") {
          results.preWarm.errors++;
          // Clear so a future triggerPreWarm call can delete and retry
          await db.from("documents").delete().eq("id", doc.id);
          continue;
        }

        const text = result.result.message.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        const draftText = extractDraftText(text);
        if (draftText) {
          await recordAiFromMessage(db, result.result.message, {
            userId: doc.user_id,
            caseFileId: doc.case_file_id,
            feature: "pre_warm",
            costMultiplier: BATCH_COST_MULTIPLIER,
            metadata: { document_id: doc.id, batch_id: batchId, wizard_type: doc.doc_type },
          });

          await db.from("documents").update({
            draft_text: draftText,
            content_json: { init_response: text },
            updated_at: new Date().toISOString(),
          }).eq("id", doc.id);
          results.preWarm.completed++;
          console.log(`[batch-poll] Pre-warm complete for doc ${doc.id}`);
        } else {
          results.preWarm.errors++;
          await db.from("documents").delete().eq("id", doc.id);
        }
      }
    } catch (err) {
      results.preWarm.errors++;
      console.error(`[batch-poll] Pre-warm error for doc ${doc.id}:`, err);
    }
  }

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

        await recordAiFromMessage(db, result.result.message, {
          userId: doc.user_id,
          actorId: null,
          caseFileId: doc.case_file_id,
          feature: "auto_critical_review",
          costMultiplier: BATCH_COST_MULTIPLIER,
          metadata: { document_id: doc.id, batch_id: batchId },
        });

        await upsertCriticalReviewChild(db, doc as unknown as Document, reviewReport);

        const cj = { ...(doc.content_json as Record<string, unknown> ?? {}) };
        delete cj.review_batch_job_id;
        await db.from("documents").update({
          review_status: "review_ready",
          content_json: cj,
          updated_at: new Date().toISOString(),
        }).eq("id", doc.id);

        results.review.completed++;
        console.log(`[batch-poll] Auto-review complete for doc ${doc.id}`);
      }
    } catch (err) {
      results.review.errors++;
      console.error(`[batch-poll] Review error for doc ${doc.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, results });
}
