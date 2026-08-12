import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveInstrumentProfile, validateInstrument } from "./validator.ts";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/validator-fixtures.json", import.meta.url), "utf8")) as Array<{ name: string; kind: string; valid: boolean; text: string }>;

for (const fixture of fixtures) {
  test(fixture.name, () => {
    const report = validateInstrument({
      profile: resolveInstrumentProfile({ instrument: fixture.kind }),
      document: { text: fixture.text, authorityMetadata: fixture.valid ? { citations: ["fixture-authority"] } : undefined },
      livingFile: { facts: [], jurisdiction: "Texas" }, now: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(report.ready_for_attorney_review, fixture.valid);
    if (!fixture.valid) assert.ok(report.errors.length > 0);
  });
}

test("model-authored readiness cannot override deterministic errors", () => {
  const report = validateInstrument({
    profile: resolveInstrumentProfile({ instrument: "will" }),
    document: { text: "READY FOR ATTORNEY REVIEW" }, livingFile: { facts: [] }, now: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(report.ready_for_attorney_review, false);
  assert.ok(report.errors.some((issue) => issue.code === "MISSING_REQUIRED_SECTION"));
});
