import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildConsultBriefSnapshot } from "@/lib/consult-brief";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Attachment, CaseFile, ConsultRequest, Document, FactItem, RequestedAttachment } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function requireAttorney(db: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  return profile?.is_attorney ?? false;
}

/**
 * One-click attorney brief pack: Living File snapshot + open gaps + draft
 * excerpts + roadmap + attachment list. Returns JSON for the print page.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const consultId = req.nextUrl.searchParams.get("consultId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let userId: string;

  if (BYPASS_AUTH) {
    db = createServiceClient();
    userId = BYPASS_USER_ID;
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
    if (!(await requireAttorney(db, userId))) {
      return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
    }
  }

  const [
    { data: caseFileRow },
    { data: factRows },
    { data: docRows },
    { data: reqRows },
    { data: attRows },
  ] = await Promise.all([
    db.from("case_files").select("*").eq("id", id).single(),
    db.from("fact_items").select("*").eq("case_file_id", id).order("created_at", { ascending: true }),
    db.from("documents").select("*").eq("case_file_id", id).order("created_at", { ascending: false }),
    db.from("requested_attachments").select("*").eq("case_file_id", id).order("created_at", { ascending: true }),
    db.from("attachments").select("id, file_name, status, created_at").eq("case_file_id", id).order("created_at", { ascending: false }),
  ]);

  if (!caseFileRow) {
    return NextResponse.json({ error: "Case file not found" }, { status: 404 });
  }

  let consultRequest: ConsultRequest | null = null;
  if (consultId) {
    const { data: consultRow } = await db.from("consult_requests").select("*").eq("id", consultId).single();
    consultRequest = (consultRow as ConsultRequest | null) ?? null;
  }

  const documents = (docRows ?? []) as Document[];
  const snapshot = buildConsultBriefSnapshot({
    caseFile: caseFileRow as CaseFile,
    facts: (factRows ?? []) as FactItem[],
    documents,
    requestedAttachments: (reqRows ?? []) as RequestedAttachment[],
    consultRequest,
  });

  const draftExcerpts = documents
    .filter((d) => !d.parent_document_id && d.draft_text && d.draft_text.trim())
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      title: d.title,
      doc_type: d.doc_type,
      status: d.status,
      excerpt: d.draft_text!.slice(0, 2500) + (d.draft_text!.length > 2500 ? "…" : ""),
      downloadHref: `/api/documents/${d.id}/download`,
    }));

  const attachments = ((attRows ?? []) as Pick<Attachment, "id" | "file_name" | "status" | "created_at">[]).map((a) => ({
    id: a.id,
    file_name: a.file_name,
    status: a.status,
    href: `/api/attachments/${a.id}`,
  }));

  return NextResponse.json({
    caseFileId: id,
    snapshot,
    draftExcerpts,
    attachments,
    livingFileHref: `/attorney/file/${id}`,
  });
}
