import { NextStepGuidePreview } from "./_guide";
import { caseFile, strategy, doc, fact } from "./_fixtures";

// Stage 4 — document sent, attorney reviewing: waiting tone, no primary CTA.
export function Stage4UnderReview() {
  return (
    <NextStepGuidePreview
      caseFile={caseFile(strategy)}
      documents={[doc({ status: "pending_review" })]}
      facts={[fact]}
    />
  );
}
