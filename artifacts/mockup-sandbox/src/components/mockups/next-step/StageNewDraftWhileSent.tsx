import { NextStepGuidePreview } from "./_guide";
import { caseFile, strategy, doc, fact } from "./_fixtures";

// Edge case — a new draft exists alongside an already-sent document. The draft
// wins (step 3 current), and step 3 is also "done" from the sent doc; the
// active-step-wins rule keeps exactly one "current" dot.
export function StageNewDraftWhileSent() {
  return (
    <NextStepGuidePreview
      caseFile={caseFile(strategy)}
      documents={[
        doc({ id: "doc-a", status: "pending_review" }),
        doc({ id: "doc-b", status: "draft" }),
      ]}
      facts={[fact]}
    />
  );
}
