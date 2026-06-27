import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectExistingCounselMention,
  counselContextFactLine,
  counselGoalLabel,
  freeChatExistingCounselNotice,
  isValidCounselGoal,
  formatCounselContextForPrompt,
} from "./existing-counsel.ts";

test("detectExistingCounselMention catches common phrasing", () => {
  assert.equal(detectExistingCounselMention("My attorney said I should wait").triggered, true);
  assert.equal(detectExistingCounselMention("I want a second opinion").triggered, true);
  assert.equal(detectExistingCounselMention("I'm looking for general info").triggered, false);
});

test("counselContextFactLine formats attorney-readable fact", () => {
  const line = counselContextFactLine({
    has_existing_counsel: true,
    existing_counsel_name: "Jane Doe, Esq.",
    counsel_engagement_goal: "document_review",
  });
  assert.match(line ?? "", /Jane Doe/i);
  assert.match(line ?? "", /review a document/i);
});

test("counselGoalLabel and isValidCounselGoal", () => {
  assert.equal(counselGoalLabel("second_opinion"), "Second opinion on one issue");
  assert.equal(isValidCounselGoal("second_opinion"), true);
  assert.equal(isValidCounselGoal("nope"), false);
});

test("free chat notice mentions privilege and Phase II", () => {
  const n = freeChatExistingCounselNotice();
  assert.match(n, /not.*privilege|not protected/i);
  assert.match(n, /Phase II|consult/i);
});

test("formatCounselContextForPrompt when intake incomplete", () => {
  const lines = formatCounselContextForPrompt({});
  assert.match(lines.join("\n"), /Not yet recorded/i);
});

test("formatCounselContextForPrompt when client has counsel", () => {
  const lines = formatCounselContextForPrompt({
    counsel_intake_at: new Date().toISOString(),
    has_existing_counsel: true,
    existing_counsel_name: "Smith LLP",
    counsel_engagement_goal: "prepare_for_meeting",
  });
  const block = lines.join("\n");
  assert.match(block, /Limited-scope/i);
  assert.match(block, /Smith LLP/);
  assert.match(block, /Prepare for a meeting/i);
});
