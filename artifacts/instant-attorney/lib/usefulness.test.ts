import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProvabilityTag } from "./provability.ts";
import { isLicensedState, jurisdictionNotice, normalizeStateCode } from "./jurisdiction.ts";
import { resolveStatutes } from "./statute-lookup.ts";
import { computeMissionControl } from "./mission-control.ts";
import type { CaseFile, ConsultActionItem } from "./types.ts";

test("parseProvabilityTag: established", () => {
  const p = parseProvabilityTag("Posted on 6/1 [established: screenshot]");
  assert.equal(p.level, "established");
  assert.equal(p.label, "Established");
  assert.equal(p.detail, "screenshot");
  assert.equal(p.displayText, "Posted on 6/1");
});

test("parseProvabilityTag: asserted", () => {
  const p = parseProvabilityTag("Manager said 'performance' [asserted: client's account]");
  assert.equal(p.level, "asserted");
  assert.match(p.displayText, /Manager said/);
});

test("parseProvabilityTag: opinion / characterization", () => {
  const p = parseProvabilityTag("This looks retaliatory [characterization/opinion]");
  assert.equal(p.level, "opinion");
  assert.equal(p.label, "Opinion");
});

test("parseProvabilityTag: no tag", () => {
  const p = parseProvabilityTag("Plain fact with no tag");
  assert.equal(p.level, "unknown");
  assert.equal(p.displayText, "Plain fact with no tag");
});

test("jurisdiction: TX and IL are licensed", () => {
  assert.equal(isLicensedState("TX"), true);
  assert.equal(isLicensedState("il"), true);
  assert.equal(isLicensedState("CA"), false);
  assert.equal(normalizeStateCode(" ny "), "NY");
  assert.ok(jurisdictionNotice("CA"));
  assert.equal(jurisdictionNotice("TX"), null);
});

test("resolveStatutes returns official URLs for debt keys", () => {
  const chips = resolveStatutes(["fdcpa-validation", "tx-wage-exemption"]);
  assert.equal(chips.length, 2);
  assert.ok(chips.every((c) => c.official_url.startsWith("http")));
});

test("consult closeout actions get CTAs for clients", () => {
  const caseFile = {
    id: "file-1",
    user_id: "u",
    title: null,
    summary: "s",
    goals: [],
    matter_type: "reactive",
    matter_subtype: "debt",
    status: "open",
    file_type: "standard",
    archive_at: null,
    pre_consult_memo: null,
    legal_strategy: { summary: "s", instruments: [], strengths: [], risks: [], recommended_wizards: [] },
    attorney_assessment: null,
    next_action: null,
    jurisdiction: null,
    opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    counsel_intake_at: new Date().toISOString(),
  } as unknown as CaseFile;

  const actions: ConsultActionItem[] = [
    { id: "a1", text: "Upload your citation", kind: "document" },
    { id: "a2", text: "Call your HOA board", kind: "general" },
  ];

  const board = computeMissionControl({
    caseFile,
    documents: [],
    facts: [],
    consultClientActions: actions,
  });

  const upload = board.actions.find((a) => a.id === "consult-action:a1");
  const general = board.actions.find((a) => a.id === "consult-action:a2");
  assert.ok(upload?.cta?.href === "#attachments");
  assert.ok(general?.cta?.href?.includes("/chat?caseFileId=file-1"));
});
