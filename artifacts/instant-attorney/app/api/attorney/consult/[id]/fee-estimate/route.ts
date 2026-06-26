import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  buildConsultFeeEstimate,
  emptyFeeEstimateDraft,
  mergeFeeEstimateWithDraft,
  normalizeFeeEstimateDraft,
} from "@/lib/consult-fee-estimate";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, ConsultRequest, Document, FactItem, RequestedAttachment } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function requireAttorney(db: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  return profile?.is_attorney ?? false;
}

async function loadConsultWithCase(
  db: ReturnType<typeof createServiceClient>,
  consultId: string,
): Promise<{ consult: ConsultRequest; caseFile: CaseFile } | null> {
  const { data: consultRow } = await db.from("consult_requests").select("*").eq("id", consultId).single();
  const consult = (consultRow as ConsultRequest | null) ?? null;
  if (!consult?.case_file_id) return null;

  const { data: caseFileRow } = await db
    .from("case_files")
    .select("*")
    .eq("id", consult.case_file_id)
    .single();

  if (!caseFileRow) return null;
  return { consult, caseFile: caseFileRow as CaseFile };
}

async function buildMergedEstimate(
  db: ReturnType<typeof createServiceClient>,
  consult: ConsultRequest,
  caseFile: CaseFile,
) {
  const caseFileId = caseFile.id;
  const [{ data: factRows }, { data: docRows }, { data: reqRows }] = await Promise.all([
    db.from("fact_items").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: true }),
    db.from("documents").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: false }),
    db.from("requested_attachments").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: true }),
  ]);

  const estimate = buildConsultFeeEstimate({
    caseFile,
    facts: (factRows ?? []) as FactItem[],
    documents: (docRows ?? []) as Document[],
    requestedAttachments: (reqRows ?? []) as RequestedAttachment[],
  });

  const draft = normalizeFeeEstimateDraft(consult.fee_estimate_draft ?? emptyFeeEstimateDraft());
  return mergeFeeEstimateWithDraft(estimate, draft);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!BYPASS_AUTH) {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await requireAttorney(db, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const serviceDb = createServiceClient();
  const loaded = await loadConsultWithCase(serviceDb, id);
  if (!loaded) {
    return NextResponse.json({ error: "Consult or linked case file not found" }, { status: 404 });
  }

  const merged = await buildMergedEstimate(serviceDb, loaded.consult, loaded.caseFile);
  return NextResponse.json(merged);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  if (!BYPASS_AUTH) {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await requireAttorney(db, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const serviceDb = createServiceClient();
  const { data: consultRow } = await serviceDb.from("consult_requests").select("*").eq("id", id).single();
  const consult = (consultRow as ConsultRequest | null) ?? null;
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });

  const existing = normalizeFeeEstimateDraft(consult.fee_estimate_draft ?? emptyFeeEstimateDraft());
  const draft = normalizeFeeEstimateDraft({
    ...existing,
    ...(typeof body.attorneyNotes === "string" ? { attorneyNotes: body.attorneyNotes } : {}),
    ...(typeof body.selectedPackageId === "string" || body.selectedPackageId === null
      ? { selectedPackageId: body.selectedPackageId }
      : {}),
    ...(body.customRange && typeof body.customRange.low === "number" && typeof body.customRange.high === "number"
      ? { customRange: body.customRange }
      : body.customRange === null
        ? { customRange: null }
        : {}),
    ...(typeof body.adjustmentNote === "string" ? { adjustmentNote: body.adjustmentNote } : {}),
    updatedAt: new Date().toISOString(),
  });

  const { data: updated, error } = await serviceDb
    .from("consult_requests")
    .update({ fee_estimate_draft: draft, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Save failed" }, { status: 500 });
  }

  if (!consult.case_file_id) {
    return NextResponse.json({ ok: true, draft });
  }

  const { data: caseFileRow } = await serviceDb
    .from("case_files")
    .select("*")
    .eq("id", consult.case_file_id)
    .single();

  if (!caseFileRow) {
    return NextResponse.json({ ok: true, draft });
  }

  const merged = await buildMergedEstimate(serviceDb, updated as ConsultRequest, caseFileRow as CaseFile);
  return NextResponse.json(merged);
}
