import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrainstormContext } from "./prompts.ts";
import { emptyWrapUp } from "./consult-wrap-up.ts";
import type { CaseFile, FactItem } from "./types.ts";

function caseFile(): CaseFile {
  return {
    id: "c1",
    status: "open",
    matter_type: "reactive",
    matter_subtype: "debt_collection",
    summary: "Client is being sued over a credit card debt.",
  } as unknown as CaseFile;
}

test("buildBrainstormContext omits the consult section when there's no closeout yet", () => {
  const context = buildBrainstormContext(caseFile(), [] as FactItem[], [], [], null);
  assert.ok(!context.includes("LATEST CONSULT CLOSEOUT"));
});

test("buildBrainstormContext includes the latest closeout's summary, strategy, and disposition", () => {
  const wrapUp = {
    ...emptyWrapUp(),
    consultSummary: "Discussed the lawsuit and the answer deadline.",
    strategyOverview: "Filing a time-barred defense given the debt's age.",
    disposition: "retain_in_house" as const,
  };
  const context = buildBrainstormContext(caseFile(), [] as FactItem[], [], [], wrapUp);
  assert.match(context, /LATEST CONSULT CLOSEOUT/);
  assert.match(context, /answer deadline/);
  assert.match(context, /time-barred defense/);
  assert.match(context, /Retain in-house/);
});
