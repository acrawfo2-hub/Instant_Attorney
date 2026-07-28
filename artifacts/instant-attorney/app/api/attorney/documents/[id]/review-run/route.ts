import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { startDocumentReview } from "@/lib/attorney-review";
import { BYPASS_USER_ID } from "@/lib/types";
import type { DocumentImprovement, DocumentReviewRun } from "@/lib/types";

// Attorney review orchestrator run (schema-stage44). GET returns the latest run
// plus its structured improvements and the revised-draft child so the review page
// can render live state and poll. POST starts a run (manual re-run, and the
// self-heal path if the submit-time fire-and-forget was cut off). See
// docs/attorney-review-orchestrator.md.

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireAttorney(): Promise<{ db: any; userId: string } | null> {
  if (BYPASS_AUTH) {
    return { db: createServiceClient(), userId: BYPASS_USER_ID };
  }
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", user.id).maybeSingle();
  if (!profile?.is_attorney) return null;
  return { db, userId: user.id };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAttorney();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const { data: runRow } = await ctx.db
    .from("document_review_runs")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const run = (runRow as DocumentReviewRun | null) ?? null;

  let improvements: DocumentImprovement[] = [];
  if (run) {
    const { data: impRows } = await ctx.db
      .from("document_improvements")
      .select("*")
      .eq("run_id", run.id)
      .order("seq", { ascending: true });
    improvements = (impRows ?? []) as DocumentImprovement[];
  }

  const { data: revised } = await ctx.db
    .from("documents")
    .select("id, draft_text, content_json, updated_at")
    .eq("parent_document_id", id)
    .eq("doc_type", "second_draft")
    .maybeSingle();

  return NextResponse.json({ run, improvements, revisedDraft: revised ?? null });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAttorney();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  // Resolve the case file from the primary document (must be a top-level doc).
  const { data: doc } = await ctx.db
    .from("documents")
    .select("id, case_file_id, parent_document_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc || doc.parent_document_id) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const run = await startDocumentReview(id, doc.case_file_id);
  if (!run) return NextResponse.json({ error: "Could not start review" }, { status: 500 });
  return NextResponse.json({ run });
}
