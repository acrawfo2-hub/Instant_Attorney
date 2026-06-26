import { NextStepGuidePreview } from "./_guide";
import { caseFile, strategy, fact } from "./_fixtures";

// Stage 2 — strategy ready, no documents yet: create the first document.
export function Stage2CreateDoc() {
  return <NextStepGuidePreview caseFile={caseFile(strategy)} documents={[]} facts={[fact]} />;
}
