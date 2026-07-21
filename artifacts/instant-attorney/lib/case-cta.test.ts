import test from "node:test";
import assert from "node:assert/strict";
import { getCaseHeaderCta } from "./case-cta.ts";
import type { NextStepGuide } from "./next-step.ts";

const CASE_ID = "00000000-0000-4000-8000-000000000001";

function guide(overrides: Partial<NextStepGuide>): NextStepGuide {
  return {
    activeStep: 1,
    steps: [],
    eyebrow: "",
    title: "",
    body: "",
    tone: "action",
    plan: [],
    ...overrides,
  };
}

test("step 1 points to conversation", () => {
  const cta = getCaseHeaderCta(guide({ activeStep: 1 }), CASE_ID);
  assert.equal(cta.label, "Continue conversation");
  assert.match(cta.href, /\/chat\?caseFileId=/);
});

test("step 2 uses wizard CTA when present", () => {
  const cta = getCaseHeaderCta(
    guide({
      activeStep: 2,
      cta: { label: "Create my Demand Letter →", href: "/wizard/demand_letter?caseFileId=x" },
    }),
    CASE_ID,
  );
  assert.equal(cta.label, "Create my Demand Letter");
  assert.equal(cta.href, "/wizard/demand_letter?caseFileId=x");
});

test("step 4 points to documents while waiting", () => {
  const cta = getCaseHeaderCta(guide({ activeStep: 4, tone: "waiting" }), CASE_ID);
  assert.equal(cta.label, "View review status");
  assert.equal(cta.href, "#documents");
});

test("in-file context scrolls to mission control for early steps", () => {
  const cta = getCaseHeaderCta(guide({ activeStep: 1 }), CASE_ID, { inFileContext: true });
  assert.equal(cta.href, "#mission-control");
});

test("in-file context uses documents anchor for review step", () => {
  const cta = getCaseHeaderCta(guide({ activeStep: 4, tone: "waiting" }), CASE_ID, { inFileContext: true });
  assert.equal(cta.href, "#documents");
});
