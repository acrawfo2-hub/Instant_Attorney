/**
 * Informed override for attorney approval / delivery.
 *
 * Unverified citations and open blocking QA findings used to *disable* Approve.
 * The product decision (leftover 4): Approve is always available; a dirty file
 * forces one confirmation with a reason. The findings stay dirty — this is not
 * a waiver and not a silent clean. The associate must never supply the reason.
 */

export interface ApprovalCitationBlocker {
  id: string;
  raw: string;
  verdict: string;
}

export interface ApprovalFindingBlocker {
  id: string;
  title: string;
  severity: string;
  check_type: string;
  status: string;
}

export interface ApprovalBlockers {
  citations: ApprovalCitationBlocker[];
  findings: ApprovalFindingBlocker[];
}

export interface InformedOverrideStamp {
  rationale: string;
  by: string;
  at: string;
  revision_number: number;
  citations: ApprovalCitationBlocker[];
  findings: ApprovalFindingBlocker[];
}

const MIN_RATIONALE = 12;

export function isApprovalDirty(blockers: ApprovalBlockers): boolean {
  return blockers.citations.length > 0 || blockers.findings.length > 0;
}

export function normalizeOverrideRationale(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length >= MIN_RATIONALE ? trimmed : null;
}

export function decideApprovalOverride(
  blockers: ApprovalBlockers,
  rationale: unknown,
): { ok: true; rationale: string | null } | { ok: false; requiresOverride: true; error: string; blockers: ApprovalBlockers } {
  if (!isApprovalDirty(blockers)) return { ok: true, rationale: null };
  const text = normalizeOverrideRationale(rationale);
  if (!text) {
    return {
      ok: false,
      requiresOverride: true,
      error:
        "This file still has unverified authorities or open blocking QA findings. Approve is available, but you must record why you are proceeding.",
      blockers,
    };
  }
  return { ok: true, rationale: text };
}

export function informedOverrideStamp(args: {
  rationale: string;
  by: string;
  at: string;
  revision_number: number;
  blockers: ApprovalBlockers;
}): InformedOverrideStamp {
  return {
    rationale: args.rationale,
    by: args.by,
    at: args.at,
    revision_number: args.revision_number,
    citations: args.blockers.citations,
    findings: args.blockers.findings,
  };
}

/** Merge a new stamp onto documents.content_json without dropping other keys. */
export function withInformedOverride(
  contentJson: Record<string, unknown> | null | undefined,
  stamp: InformedOverrideStamp,
): Record<string, unknown> {
  const current = contentJson ?? {};
  const prior = Array.isArray(current.informed_overrides) ? current.informed_overrides : [];
  return { ...current, informed_overrides: [...prior, stamp] };
}

export async function loadApprovalBlockers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  documentId: string,
): Promise<ApprovalBlockers> {
  const [{ data: citationRows }, { data: findingRows }] = await Promise.all([
    db.from("document_qa_citations")
      .select("id, raw, verdict")
      .eq("document_id", documentId)
      .eq("waived", false)
      .neq("verdict", "verified"),
    db.from("document_qa_findings")
      .select("id, title, severity, check_type, status")
      .eq("document_id", documentId)
      .eq("severity", "blocking")
      .eq("status", "open"),
  ]);
  return {
    citations: (citationRows ?? []) as ApprovalCitationBlocker[],
    findings: (findingRows ?? []) as ApprovalFindingBlocker[],
  };
}
