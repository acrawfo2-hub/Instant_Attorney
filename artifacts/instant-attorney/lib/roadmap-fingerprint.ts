import { createHash } from "crypto";
import type { CaseFile, ConsultRequest, Document, FactItem, RequestedAttachment } from "./types";

export interface RoadmapFingerprintInput {
  caseFile: Pick<
    CaseFile,
    | "matter_type"
    | "matter_subtype"
    | "summary"
    | "legal_strategy"
    | "financial_disclosure_acked_at"
    | "updated_at"
  >;
  facts: Pick<FactItem, "status" | "description" | "kind" | "updated_at">[];
  documents: Pick<Document, "status" | "title" | "updated_at">[];
  requestedAttachments: Pick<RequestedAttachment, "status" | "description">[];
  consultRequest: Pick<ConsultRequest, "status" | "updated_at"> | null;
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
    input.caseFile.updated_at ?? "",
  ].join("\x1e");

  return createHash("sha256").update(payload).digest("hex");
}
