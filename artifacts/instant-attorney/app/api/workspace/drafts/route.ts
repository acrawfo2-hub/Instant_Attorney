import { NextRequest, NextResponse } from "next/server";
import { getClientWorkspaceContext } from "@/lib/client-workspace-auth";
import { DRAFT_JOB_LABELS, isActiveDraftJob, type DraftGenerationJob } from "@/lib/draft-generation-status";

// Consumer freestyle side-panel drafts for a case file. Owner-only via the gate
// + RLS. Attachments and messages already live in the privileged intake channel;
// this is just the editable drafts store behind the split screen.
export async function GET(req: NextRequest) {
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });

  const ctx = await getClientWorkspaceContext(caseFileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data, error }, { data: jobRows, error: jobsError }] = await Promise.all([
    ctx.db.from("client_workspace_drafts").select("*").eq("case_file_id", caseFileId)
      .eq("user_id", ctx.userId).order("updated_at", { ascending: false }),
    ctx.db.from("workspace_draft_jobs").select("*").eq("case_file_id", caseFileId)
      .eq("user_id", ctx.userId).order("started_at", { ascending: true }),
  ]);

  if (error) {
    console.error("[workspace/drafts] list error:", error);
    return NextResponse.json({ error: "Failed to load drafts" }, { status: 500 });
  }
  // Keep drafts usable during a rolling migration where the jobs table may not
  // have reached a deployment yet. The dedicated status endpoint remains strict.
  const generationJobs = jobsError ? [] : ((jobRows ?? []) as DraftGenerationJob[]).map((job) => ({
    ...job, label: DRAFT_JOB_LABELS[job.state], active: isActiveDraftJob(job.state),
  }));
  return NextResponse.json({ drafts: data ?? [], generationJobs });
}

// Create a blank (or seeded) draft the client starts by hand.
export async function POST(req: NextRequest) {
  const { caseFileId, title, content } = await req.json().catch(() => ({})) as {
    caseFileId?: string; title?: string; content?: string;
  };
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });

  const ctx = await getClientWorkspaceContext(caseFileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await ctx.db
    .from("client_workspace_drafts")
    .insert({
      case_file_id: caseFileId,
      user_id: ctx.userId,
      title: (title ?? "").trim() || "Untitled draft",
      content: content ?? "",
      source: "client",
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[workspace/drafts] create error:", error);
    return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
}
