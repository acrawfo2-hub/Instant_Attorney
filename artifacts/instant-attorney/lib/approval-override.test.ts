import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideApprovalOverride,
  informedOverrideStamp,
  isApprovalDirty,
  normalizeOverrideRationale,
  withInformedOverride,
  type ApprovalBlockers,
} from "./approval-override.ts";

const clean: ApprovalBlockers = { citations: [], findings: [] };
const dirty: ApprovalBlockers = {
  citations: [{ id: "c1", raw: "Smith v. Jones", verdict: "unsupported" }],
  findings: [{ id: "f1", title: "Missing signature block", severity: "blocking", check_type: "blanks_execution_blocks", status: "open" }],
};

test("a clean file does not require an override rationale", () => {
  assert.equal(isApprovalDirty(clean), false);
  const decision = decideApprovalOverride(clean, undefined);
  assert.equal(decision.ok, true);
  if (decision.ok) assert.equal(decision.rationale, null);
});

test("a dirty file without a reason is not an approval", () => {
  assert.equal(isApprovalDirty(dirty), true);
  const decision = decideApprovalOverride(dirty, "   ok  ");
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.requiresOverride, true);
    assert.equal(decision.blockers.citations.length, 1);
    assert.equal(decision.blockers.findings.length, 1);
  }
});

test("a dirty file with a real reason may proceed; the stamp does not waive", () => {
  const decision = decideApprovalOverride(dirty, "I reviewed the unsupported cite against the file and am sending anyway.");
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.match(decision.rationale ?? "", /sending anyway/);
  const stamp = informedOverrideStamp({
    rationale: decision.rationale!,
    by: "atty-1",
    at: "2026-08-13T00:00:00Z",
    revision_number: 4,
    blockers: dirty,
  });
  assert.equal(stamp.citations[0].verdict, "unsupported");
  assert.equal(stamp.findings[0].status, "open");
  const json = withInformedOverride({ instrument_key: "demand_letter" }, stamp);
  assert.equal(json.instrument_key, "demand_letter");
  assert.equal((json.informed_overrides as unknown[]).length, 1);
});

test("whitespace-only and tiny rationales are rejected", () => {
  assert.equal(normalizeOverrideRationale("\n\t"), null);
  assert.equal(normalizeOverrideRationale("too short"), null);
  assert.ok(normalizeOverrideRationale("I have read the blockers and accept them."));
});
