import { NextStepGuidePreview } from "./_guide";
import { caseFile, strategy, doc, fact } from "./_fixtures";

// Stage 5 — approved: done tone, "Get my document".
export function Stage5Done() {
  return (
    <NextStepGuidePreview
      caseFile={caseFile(strategy)}
      documents={[doc({ status: "approved" })]}
      facts={[fact]}
    />
  );
}
