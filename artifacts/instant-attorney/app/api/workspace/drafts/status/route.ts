import { NextRequest, NextResponse } from "next/server";
import { getClientWorkspaceContext } from "@/lib/client-workspace-auth";
import { DRAFT_JOB_LABELS, type DraftGenerationJob, isActiveDraftJob } from "@/lib/draft-generation-status";

export async function GET(req: NextRequest) {
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });
  const ctx = await getClientWorkspaceContext(caseFileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await ctx.db.from("workspace_draft_jobs").select("*")
    .eq("case_file_id", caseFileId).eq("user_id", ctx.userId)
    .order("started_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Failed to load draft status" }, { status: 500 });

  const jobs = ((data ?? []) as DraftGenerationJob[]).map((job) => ({
    ...job,
    label: DRAFT_JOB_LABELS[job.state],
    active: isActiveDraftJob(job.state),
  }));
  return NextResponse.json({ caseFileId, jobs });
}

export async function DELETE(req: NextRequest) {
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!caseFileId || !jobId) return NextResponse.json({ error: "caseFileId and jobId required" }, { status: 400 });
  const ctx = await getClientWorkspaceContext(caseFileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const now = new Date().toISOString();
  const { data, error } = await ctx.db.from("workspace_draft_jobs")
    .update({ state: "cancelled", finished_at: now, updated_at: now })
    .eq("id", jobId).eq("case_file_id", caseFileId).eq("user_id", ctx.userId)
    .in("state", ["preparing", "drafting", "waiting_for_facts", "checking"])
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not cancel drafting" }, { status: 500 });
  return NextResponse.json({ cancelled: Boolean(data), jobId });
}
