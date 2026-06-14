import { NextStepGuidePreview } from "./_guide";
import { caseFile, strategy, doc, fact } from "./_fixtures";

// Stage 3 — a draft exists: review it and send to the attorney.
export function Stage3ReviewDraft() {
  return (
    <NextStepGuidePreview
      caseFile={caseFile(strategy)}
      documents={[doc({ status: "draft" })]}
      facts={[fact]}
    />
  );
}
