import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFileContext } from "./prompts.ts";
import type { CaseFile, FactItem } from "./types.ts";

// Locks the Tier-0 "provability lens" behaviour at the one place it's actual code:
// buildFileContext must explain the evidentiary tags so every downstream agent
// (drafter, memo, What-If) interprets them, and an inline tag on a fact must ride
// through verbatim (the tag lives in the fact description — no schema change).
// See docs/provability-lens-design.md.

function caseFile(): CaseFile {
  return {
    id: "c1",
    status: "open",
    matter_type: "reactive",
    matter_subtype: "defamation",
    summary: "A false statement was posted online.",
  } as unknown as CaseFile;
}

function fact(description: string): FactItem {
  return {
    id: "f1",
    case_file_id: "c1",
    user_id: "u1",
    description,
    status: "confirmed",
    kind: "fact",
  } as unknown as FactItem;
}

test("confirmed facts carry an evidentiary-tag legend for downstream agents", () => {
  const ctx = buildFileContext(caseFile(), [fact("Defendant posted the statement on 6/1 [established: screenshot]")]);
  assert.match(ctx, /CONFIRMED FACTS:/);
  assert.match(ctx, /established/i);
  assert.match(ctx, /asserted/i);
  assert.match(ctx, /characterization\/opinion/i);
});

test("an inline evidentiary tag rides through verbatim in the fact line", () => {
  const ctx = buildFileContext(caseFile(), [fact("Manager called it 'performance' [asserted: client's account]")]);
  assert.match(ctx, /Manager called it 'performance' \[asserted: client's account\]/);
});

test("no confirmed-facts section (and no legend) when there are none", () => {
  const ctx = buildFileContext(caseFile(), []);
  assert.ok(!ctx.includes("CONFIRMED FACTS:"));
});
