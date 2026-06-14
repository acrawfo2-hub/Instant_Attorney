import type { CaseFile, Document, FactItem, LegalStrategy } from "./_engine";

export const strategy: LegalStrategy = {
  recommended_wizards: ["demand_letter"],
  instruments: ["Demand letter to landlord"],
};

export function caseFile(legal_strategy: LegalStrategy | null = null): CaseFile {
  return { id: "case-1", legal_strategy };
}

export function doc(overrides: Partial<Document>): Document {
  return {
    id: "doc-1",
    doc_type: "demand_letter",
    status: "draft",
    draft_text: "Full draft text here.",
    ...overrides,
  };
}

export const fact: FactItem = { id: "fact-1" };
