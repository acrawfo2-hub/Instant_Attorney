import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getClientWorkspaceContext } from "@/lib/client-workspace-auth";
import {
  DRAFT_JOB_LABELS,
  draftJobFromGenerationRow,
  isActiveDraftJob,
  type DocumentGenerationJobRow,
} from "@/lib/draft-generation-status";

const JOB_COLUMNS = "id, case_file_id, user_id, document_type, title, status, workspace_draft_id, error, generation_attempt, created_at, started_at, updated_at, completed_at";
const ACTIVE_STATUSES = ["queued", "drafting", "waiting_for_facts", "checking"];

export async function GET(req: NextRequest) {
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });
  const ctx = await getClientWorkspaceContext(caseFileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await ctx.db.from("document_generation_jobs").select(JOB_COLUMNS)
    .eq("case_file_id", caseFileId).eq("user_id", ctx.userId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Failed to load draft status" }, { status: 500 });

  const jobs = ((data ?? []) as DocumentGenerationJobRow[]).map((row) => {
    const job = draftJobFromGenerationRow(row);
    return { ...job, label: DRAFT_JOB_LABELS[job.state], active: isActiveDraftJob(job.state) };
  });
  return NextResponse.json({ caseFileId, jobs });
}

export async function DELETE(req: NextRequest) {
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!caseFileId || !jobId) return NextResponse.json({ error: "caseFileId and jobId required" }, { status: 400 });
  const ctx = await getClientWorkspaceContext(caseFileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const now = new Date().toISOString();
  // Mutations on document_generation_jobs have no client RLS policy — workers
  // and dispatchers use the service role. Ownership was checked above.
  const { data, error } = await createServiceClient().from("document_generation_jobs")
    .update({ status: "cancelled", completed_at: now, updated_at: now })
    .eq("id", jobId).eq("case_file_id", caseFileId).eq("user_id", ctx.userId)
    .in("status", ACTIVE_STATUSES)
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not cancel drafting" }, { status: 500 });
  return NextResponse.json({ cancelled: Boolean(data), jobId });
}
