import { createHash } from "crypto";
import type { CaseFile, ConsultRequest, Document, FactItem, RequestedAttachment } from "./types.ts";

// Only fields that actually feed the hash below are picked. Notably this does NOT
// include caseFile.updated_at: that column bumps on essentially any write to the
// case row, so hashing it would bust the snapshot on changes that don't affect the
// roadmap at all — triggering a needless paid AI refresh on the next file open.
// Every roadmap-material signal is captured explicitly here instead.
export interface RoadmapFingerprintInput {
  caseFile: Pick<
    CaseFile,
    | "matter_type"
    | "matter_subtype"
    | "summary"
    | "legal_strategy"
    | "financial_disclosure_acked_at"
  >;
  facts: Pick<FactItem, "status" | "description">[];
  documents: Pick<Document, "status" | "title">[];
  requestedAttachments: Pick<RequestedAttachment, "status">[];
  consultRequest: Pick<ConsultRequest, "status"> | null;
  attachmentCount: number;
}

/**
 * Deterministic hash of material file signals. When this changes, the roadmap
 * overlay should be regenerated. Cheap to compute on every page load.
 */
export function computeRoadmapFingerprint(input: RoadmapFingerprintInput): string {
  const confirmed = input.facts
    .filter((f) => f.status === "confirmed")
    .map((f) => f.description)
    .sort();
  const gaps = input.facts
    .filter((f) => f.status === "gap")
    .map((f) => f.description)
    .sort();
  const docSig = input.documents
    .map((d) => `${d.title}:${d.status}`)
    .sort()
    .join("|");
  const pendingUploads = input.requestedAttachments.filter((r) => r.status === "requested").length;
  const strategy = input.caseFile.legal_strategy;
  const planLen = strategy?.document_plan?.length ?? 0;
  const wizardLen = strategy?.recommended_wizards?.length ?? 0;

  const payload = [
    input.caseFile.matter_type ?? "",
    input.caseFile.matter_subtype ?? "",
    (input.caseFile.summary ?? "").slice(0, 500),
    confirmed.join("\n"),
    gaps.join("\n"),
    docSig,
    String(pendingUploads),
    String(planLen),
    String(wizardLen),
    input.consultRequest?.status ?? "none",
    String(input.attachmentCount),
    input.caseFile.financial_disclosure_acked_at ?? "",
  ].join("\x1e");

  return createHash("sha256").update(payload).digest("hex");
}
