import { NextStepGuidePreview } from "./_guide";
import { caseFile, strategy, doc, fact } from "./_fixtures";

// Revisions branch — attorney requested changes: back to step 3 (current),
// even though that step also counts as "done" (the bug-fix case).
export function StageRevisions() {
  return (
    <NextStepGuidePreview
      caseFile={caseFile(strategy)}
      documents={[doc({ status: "changes_requested" })]}
      facts={[fact]}
    />
  );
}
