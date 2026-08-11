import { NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  const { id } = await params;
  const { db } = viewer;
  const { data: document } = await db
    .from("documents")
    .select("id, case_file_id")
    .eq("id", id)
    .single();

  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const caseFileId = document.case_file_id;
  const [caseFile, facts, messages, requestedAttachments, attachments] = await Promise.all([
    db.from("case_files").select("id, matter_type, matter_subtype, summary, goals, jurisdiction, has_existing_counsel, existing_counsel_name, counsel_engagement_goal, counsel_intake_at").eq("id", caseFileId).single(),
    db.from("fact_items").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: true }),
    db.from("intake_messages").select("id, role, content, created_at").eq("case_file_id", caseFileId).order("created_at", { ascending: true }),
    db.from("requested_attachments").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: true }),
    db.from("attachments").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: false }),
  ]);

  if (!caseFile.data) return NextResponse.json({ error: "Case file not found" }, { status: 404 });
  return NextResponse.json({
    caseFile: caseFile.data,
    facts: facts.data ?? [],
    intakeMessages: messages.data ?? [],
    requestedAttachments: requestedAttachments.data ?? [],
    attachments: attachments.data ?? [],
  });
}
