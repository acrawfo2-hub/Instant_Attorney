import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFullDepthState,
  isLicensedState,
  isPrepMode,
  jurisdictionNotice,
  normalizeStateCode,
  prepModePromptBlock,
  stateBarReferralUrl,
} from "./jurisdiction.ts";
import { buildAcpSystemPrompt, buildFreeChatSystemPrompt } from "./prompts.ts";
import { computeMissionControl } from "./mission-control.ts";
import type { CaseFile } from "./types.ts";

test("full depth is Texas only; IL is Prep mode", () => {
  assert.equal(isFullDepthState("TX"), true);
  assert.equal(isFullDepthState("IL"), false);
  assert.equal(isPrepMode("IL"), true);
  assert.equal(isPrepMode("CA"), true);
  assert.equal(isPrepMode("TX"), false);
  assert.equal(isLicensedState("IL"), false); // deprecated alias = full depth
  assert.equal(normalizeStateCode("Illinois"), "IL");
  assert.ok(jurisdictionNotice("IL"));
  assert.ok(jurisdictionNotice("CA"));
  assert.equal(jurisdictionNotice("TX"), null);
});

test("prep prompt block names the state and forbids Texas defaults", () => {
  const block = prepModePromptBlock("CA");
  assert.match(block, /California/);
  assert.match(block, /LOCAL COUNSEL PREP/i);
  assert.match(block, /do NOT/i);
});

test("free chat and ACP prompts branch for Prep mode", () => {
  const free = buildFreeChatSystemPrompt("NY");
  assert.match(free, /LOCAL COUNSEL PREP/i);
  assert.match(free, /New York/);

  const acp = buildAcpSystemPrompt(["family"], "client", { homeState: "IL" });
  assert.match(acp, /LOCAL COUNSEL PREP/i);
  assert.doesNotMatch(acp, /DEEP-DIVE REFERENCE/);

  const txAcp = buildAcpSystemPrompt(["family"], "client", { homeState: "TX" });
  assert.match(txAcp, /DEEP-DIVE REFERENCE/);
});

test("mission control surfaces local counsel handoff in Prep mode", () => {
  const caseFile = {
    id: "file-1",
    user_id: "u",
    title: "CA matter",
    summary: "s",
    goals: [],
    matter_type: "reactive",
    matter_subtype: "employment",
    status: "open",
    file_type: "standard",
    archive_at: null,
    pre_consult_memo: null,
    legal_strategy: { summary: "s", instruments: [], strengths: [], risks: [], recommended_wizards: [] },
    attorney_assessment: null,
    next_action: null,
    jurisdiction: "California",
    opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    counsel_intake_at: new Date().toISOString(),
  } as unknown as CaseFile;

  const board = computeMissionControl({
    caseFile,
    documents: [],
    facts: [],
  });
  assert.ok(board.actions.some((a) => a.id === "prep:local-counsel"));
  assert.ok(stateBarReferralUrl("CA").startsWith("http"));
});
