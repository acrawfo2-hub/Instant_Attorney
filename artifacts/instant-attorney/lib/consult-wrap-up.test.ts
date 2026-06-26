import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyWrapUp,
  normalizeWrapUp,
  validateWrapUpForSubmit,
  clientFacingConsultSummary,
} from "./consult-wrap-up.ts";

test("validateWrapUpForSubmit requires summary, disposition, and actions", () => {
  const result = validateWrapUpForSubmit(emptyWrapUp());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("summary")));
});

test("validateWrapUpForSubmit requires referral notes for refer_out", () => {
  const wrapUp = {
    ...emptyWrapUp(),
    consultSummary: "Discussed PI claim and next steps.",
    disposition: "refer_out" as const,
    clientActions: [{ id: "1", text: "Gather medical records", kind: "general" as const }],
  };
  const missing = validateWrapUpForSubmit(wrapUp);
  assert.equal(missing.ok, false);

  const ok = validateWrapUpForSubmit({ ...wrapUp, referralNotes: "Refer to Smith & Associates for litigation." });
  assert.equal(ok.ok, true);
});

test("normalizeWrapUp filters empty action rows", () => {
  const wrapUp = normalizeWrapUp({
    consultSummary: "  Summary  ",
    disposition: "retain_in_house",
    clientActions: [{ id: "a", text: "  Upload photos  ", kind: "document" }, { id: "b", text: "  ", kind: "general" }],
    attorneyActions: [],
  });
  assert.equal(wrapUp.consultSummary, "Summary");
  assert.equal(wrapUp.clientActions.length, 1);
  assert.equal(wrapUp.clientActions[0].kind, "document");
});

test("clientFacingConsultSummary appends referral notes", () => {
  const text = clientFacingConsultSummary({
    ...emptyWrapUp(),
    consultSummary: "We reviewed the demand strategy.",
    disposition: "refer_out",
    referralNotes: "Contact Jane Doe, Esq. for trial counsel.",
    clientActions: [],
    attorneyActions: [],
  });
  assert.match(text, /demand strategy/);
  assert.match(text, /Jane Doe/);
});
