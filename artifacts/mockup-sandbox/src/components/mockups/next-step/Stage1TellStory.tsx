import { NextStepGuidePreview } from "./_guide";
import { caseFile } from "./_fixtures";

// Stage 1 — brand-new file: no strategy, no facts. Never a dead end.
export function Stage1TellStory() {
  return <NextStepGuidePreview caseFile={caseFile(null)} documents={[]} facts={[]} />;
}
