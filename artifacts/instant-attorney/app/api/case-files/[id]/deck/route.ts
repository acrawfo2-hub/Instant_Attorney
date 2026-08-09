import { NextRequest, NextResponse } from "next/server";
import { getClientWorkspaceContext } from "@/lib/client-workspace-auth";
import { buildMatterTasks } from "@/lib/matter-tasks";
import { buildFileDeck } from "@/lib/file-deck";
import type {
  Attachment,
  CaseFile,
  ClientWorkspaceDraft,
  ConsultRequest,
  Document,
  FactItem,
  GovFormInstrument,
  RequestedAttachment,
} from "@/lib/types";

// The same deck the Living File renders, for the chat's pinned "where we stand"
// rail. The rail exists because the standing read is the part clients say they
// want and the part that scrolls away fastest — a long answer buries it within
// one turn. Pinning it means the status has to be readable without the page it
// lives on, so it is served here rather than duplicated.
//
// Owner-scoped by getClientWorkspaceContext (+ RLS). Read-only.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseFileId } = await params;
  const ctx = await getClientWorkspaceContext(caseFileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { db, userId } = ctx;

  const [
    { data: caseFile },
    { data: facts },
    { data: documents },
    { data: requestedRows },
    { data: formRows },
    { data: attachmentRows },
    { data: draftRows },
    { data: consultRow },
  ] = await Promise.all([
    db.from("case_files").select("*").eq("id", caseFileId).eq("user_id", userId).single(),
    db.from("fact_items").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: true }),
    db.from("documents").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: false }),
    db.from("requested_attachments").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: true }),
    db.from("form_instruments").select("*").eq("case_file_id", caseFileId).neq("status", "dismissed"),
    db.from("attachments").select("*").eq("case_file_id", caseFileId),
    db.from("client_workspace_drafts").select("*").eq("case_file_id", caseFileId).eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    db.from("consult_requests").select("*").eq("user_id", userId)
      .in("status", ["pending", "confirmed", "attorney_proposed"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!caseFile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allDocs = (documents ?? []) as Document[];
  // Mirror the Living File's filtering so the rail and the page can never
  // disagree about what is on the matter.
  const topDocuments = allDocs.filter((d) => d.status !== "pre_warmed" && !d.parent_document_id);
  const childDocuments = allDocs.filter((d) => !!d.parent_document_id);
  const factItems = (facts ?? []) as FactItem[];
  const requestedAttachments = (requestedRows ?? []) as RequestedAttachment[];
  const govForms = (formRows ?? []) as GovFormInstrument[];
  const attachments = (attachmentRows ?? []) as Attachment[];

  const tasks = buildMatterTasks({
    caseFile: caseFile as CaseFile,
    facts: factItems,
    documents: topDocuments,
    requestedAttachments,
    govForms,
    attachments,
    mode: "client",
  });

  const deck = buildFileDeck({
    caseFile: caseFile as CaseFile,
    facts: factItems,
    tasks,
    documents: topDocuments,
    childDocuments,
    workspaceDrafts: (draftRows ?? []) as ClientWorkspaceDraft[],
    attachments,
    requestedAttachments,
    govForms,
    consultRequest: (consultRow as ConsultRequest | null) ?? null,
  });

  return NextResponse.json({
    deck,
    recap: (caseFile as CaseFile).chat_session_summary ?? null,
  });
}
