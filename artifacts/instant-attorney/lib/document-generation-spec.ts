import type { InstrumentType } from "./types.ts";

export type DraftSectionKind = "identity" | "facts" | "analysis" | "remedy" | "terms" | "execution" | "review";

export interface SectionSpec {
  id: string;
  kind: DraftSectionKind;
  factKeys: string[];
  draftingInstructions: string;
}

export interface DocumentGenerationSpec {
  documentType: InstrumentType;
  requiredFactKeys: string[];
  optionalFactKeys: string[];
  sections: SectionSpec[];
  draftingInstructions: string;
}

const commonIdentity = ["client.name", "client.address", "counterparty.name", "jurisdiction"];

function spec(
  documentType: InstrumentType,
  requiredFactKeys: string[],
  optionalFactKeys: string[],
  draftingInstructions: string,
  sections: SectionSpec[],
): DocumentGenerationSpec {
  return { documentType, requiredFactKeys, optionalFactKeys, draftingInstructions, sections };
}

export const DOCUMENT_GENERATION_SPECS: Record<InstrumentType, DocumentGenerationSpec> = {
  demand_letter: spec("demand_letter", [...commonIdentity, "dispute.events", "remedy.requested"], ["deadline.response", "damages.amount", "authority.citations"], "State only supported facts, make the requested cure and response deadline explicit, and preserve all claims and defenses.", [
    { id: "heading", kind: "identity", factKeys: commonIdentity, draftingInstructions: "Address and identify the parties." },
    { id: "background", kind: "facts", factKeys: ["dispute.events"], draftingInstructions: "Give a chronological, supportable account." },
    { id: "legal_position", kind: "analysis", factKeys: ["dispute.events", "jurisdiction", "authority.citations"], draftingInstructions: "Explain the position without overstating uncertain law." },
    { id: "demand", kind: "remedy", factKeys: ["remedy.requested", "damages.amount", "deadline.response"], draftingInstructions: "Specify cure, amount, and deadline." },
  ]),
  complaint_letter: spec("complaint_letter", [...commonIdentity, "complaint.conduct", "complaint.recipient"], ["complaint.policy", "remedy.requested", "complaint.prior_reports"], "Use a professional factual tone, distinguish observed conduct from conclusions, and request a concrete investigation or cure.", [
    { id: "addressee", kind: "identity", factKeys: [...commonIdentity, "complaint.recipient"], draftingInstructions: "Identify sender, recipient, and subject." },
    { id: "reported_conduct", kind: "facts", factKeys: ["complaint.conduct", "complaint.prior_reports"], draftingInstructions: "Report events chronologically." },
    { id: "policy_and_impact", kind: "analysis", factKeys: ["complaint.conduct", "complaint.policy", "jurisdiction"], draftingInstructions: "Connect conduct to applicable policy or legal concern cautiously." },
    { id: "requested_action", kind: "remedy", factKeys: ["remedy.requested"], draftingInstructions: "Request specific next steps and confirmation." },
  ]),
  draft_contract: spec("draft_contract", ["parties", "contract.subject", "contract.consideration", "contract.term"], ["contract.termination", "contract.disputes", "contract.confidentiality", "jurisdiction"], "Draft reciprocal, operational terms; define ambiguous terms and avoid inventing business deal points.", [
    { id: "parties_and_purpose", kind: "identity", factKeys: ["parties", "contract.subject"], draftingInstructions: "Define parties and purpose." },
    { id: "commercial_terms", kind: "terms", factKeys: ["contract.subject", "contract.consideration", "contract.term"], draftingInstructions: "State performance, payment, and timing precisely." },
    { id: "risk_allocation", kind: "analysis", factKeys: ["contract.termination", "contract.disputes", "contract.confidentiality", "jurisdiction"], draftingInstructions: "Use coherent default and remedy provisions." },
    { id: "signatures", kind: "execution", factKeys: ["parties"], draftingInstructions: "Provide correctly labeled signature blocks." },
  ]),
  draft_waiver: spec("draft_waiver", ["parties", "waiver.activity", "waiver.risks"], ["waiver.release_scope", "waiver.minor", "jurisdiction"], "Use conspicuous, plain language; do not waive non-waivable rights and tailor the release to disclosed risks.", [
    { id: "participants", kind: "identity", factKeys: ["parties", "waiver.activity"], draftingInstructions: "Identify releasor, released parties, and activity." },
    { id: "risk_acknowledgment", kind: "facts", factKeys: ["waiver.activity", "waiver.risks"], draftingInstructions: "Describe inherent and disclosed risks." },
    { id: "release", kind: "analysis", factKeys: ["waiver.release_scope", "jurisdiction", "waiver.minor"], draftingInstructions: "Tailor release and assumption-of-risk language." },
    { id: "execution", kind: "execution", factKeys: ["parties", "waiver.minor"], draftingInstructions: "Include required participant or guardian signatures." },
  ]),
  wills_trusts: spec("wills_trusts", ["client.name", "client.family", "estate.fiduciaries", "estate.distribution", "jurisdiction"], ["estate.guardians", "estate.specific_gifts", "estate.contingencies", "estate.assets"], "Preserve testamentary intent, use explicit contingencies, and flag execution formalities for attorney verification.", [
    { id: "declarations", kind: "identity", factKeys: ["client.name", "client.family", "jurisdiction"], draftingInstructions: "Identify testator/settlor and revoke prior instruments where appropriate." },
    { id: "fiduciaries", kind: "terms", factKeys: ["estate.fiduciaries", "estate.guardians"], draftingInstructions: "Name primary and successor fiduciaries." },
    { id: "distributions", kind: "remedy", factKeys: ["estate.distribution", "estate.specific_gifts", "estate.contingencies", "estate.assets"], draftingInstructions: "Implement gifts, residue, and failure-of-gift contingencies." },
    { id: "execution", kind: "execution", factKeys: ["client.name", "jurisdiction"], draftingInstructions: "Supply jurisdiction-appropriate execution blocks for review." },
  ]),
  doc_review: spec("doc_review", ["source.document", "review.objective"], ["jurisdiction", "client.concerns", "review.deadlines"], "Analyze the supplied instrument rather than rewriting it; distinguish text, inference, risk, and recommended revision.", [
    { id: "scope", kind: "identity", factKeys: ["source.document", "review.objective"], draftingInstructions: "Identify document and review scope." },
    { id: "findings", kind: "review", factKeys: ["source.document", "client.concerns", "jurisdiction"], draftingInstructions: "Rank findings by consequence and cite the reviewed provision." },
    { id: "recommended_changes", kind: "remedy", factKeys: ["source.document", "review.objective", "review.deadlines"], draftingInstructions: "Give actionable changes and time-sensitive next steps." },
  ]),
  general_document: spec("general_document", ["document.purpose", "parties", "material.facts"], ["jurisdiction", "remedy.requested", "document.deadline"], "Follow the named instrument's conventions, use placeholders for genuinely missing particulars, and never fabricate clauses or facts.", [
    { id: "caption_and_parties", kind: "identity", factKeys: ["document.purpose", "parties", "jurisdiction"], draftingInstructions: "Use an instrument-appropriate heading and identify parties." },
    { id: "operative_facts", kind: "facts", factKeys: ["material.facts"], draftingInstructions: "Present only supported operative facts." },
    { id: "operative_provisions", kind: "analysis", factKeys: ["document.purpose", "material.facts", "remedy.requested", "document.deadline", "jurisdiction"], draftingInstructions: "Draft provisions that accomplish the stated purpose coherently." },
    { id: "execution", kind: "execution", factKeys: ["parties", "jurisdiction"], draftingInstructions: "Provide suitable execution or filing blocks." },
  ]),
  improve_draft: spec("improve_draft", ["source.document", "review.objective"], ["material.facts", "jurisdiction", "client.concerns"], "Preserve sound language and the client's deal or litigation posture while correcting only identified defects.", [
    { id: "document", kind: "review", factKeys: ["source.document", "review.objective", "material.facts", "jurisdiction", "client.concerns"], draftingInstructions: "Return a complete improved document with the source structure preserved unless restructuring is necessary." },
  ]),
};

export function getDocumentGenerationSpec(type: InstrumentType): DocumentGenerationSpec {
  return DOCUMENT_GENERATION_SPECS[type];
}

export function specForPrompt(type: InstrumentType): string {
  const value = getDocumentGenerationSpec(type);
  return `DOCUMENT GENERATION SPEC (binding):\n${JSON.stringify(value, null, 2)}\nReturn the rendered draft as usual, then append a machine-readable section envelope between ---STRUCTURED SECTIONS--- and ---END STRUCTURED SECTIONS---. The envelope must be a JSON array of {"id": string, "text": string, "factKeys": string[]} using exactly the section identifiers above. factKeys must list every source fact consumed by that section.`;
}
