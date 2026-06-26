import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAcpMatterSignals, resolveAcpPracticeAreas } from "./acp-matter-areas.ts";
import type { CaseFile } from "./types.ts";

const baseFile = (overrides: Partial<CaseFile> = {}): CaseFile => ({
  id: "cf-1",
  user_id: "u-1",
  matter_type: "reactive",
  matter_subtype: null,
  status: "open",
  file_type: "standard",
  title: null,
  archive_at: null,
  pre_consult_memo: null,
  goals: [],
  summary: null,
  legal_strategy: null,
  attorney_assessment: null,
  next_action: null,
  jurisdiction: null,
  opened_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe("resolveAcpPracticeAreas", () => {
  it("returns empty for an unclassified early intake", () => {
    const signals = buildAcpMatterSignals(baseFile(), [], "Hello, I need some help");
    const areas = resolveAcpPracticeAreas(signals);
    assert.equal(areas.length, 0);
  });

  it("includes employment when subtype matches", () => {
    const signals = buildAcpMatterSignals(
      baseFile({ matter_subtype: "wrongful termination", summary: "Fired last week" }),
      [],
      "",
    );
    assert.ok(resolveAcpPracticeAreas(signals).includes("employment"));
  });

  it("includes family for divorce matters", () => {
    const signals = buildAcpMatterSignals(
      baseFile({ matter_subtype: "divorce", summary: "Child custody dispute" }),
      [],
      "",
    );
    assert.ok(resolveAcpPracticeAreas(signals).includes("family"));
  });

  it("prefers employment over PI for workplace injury text", () => {
    const signals = buildAcpMatterSignals(
      baseFile(),
      [],
      "I was injured at work and my employer retaliated",
    );
    const areas = resolveAcpPracticeAreas(signals);
    assert.ok(areas.includes("employment"));
    assert.ok(!areas.includes("personal_injury"));
  });
});
