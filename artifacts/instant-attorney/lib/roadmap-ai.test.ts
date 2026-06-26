import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoadmapOverlayFromModel } from "./roadmap-ai.ts";
import { snapshotIsFresh } from "./roadmap-snapshot.ts";
import type { RoadmapSnapshotRow } from "./roadmap-types.ts";

test("parseRoadmapOverlayFromModel extracts JSON block", () => {
  const text = `Some preamble
---ROADMAP OVERLAY---
{
  "stage_notes": { "file": "You mentioned filing — good progress." },
  "emphasize_stages": ["file"],
  "consult_recommended": true,
  "consult_reason": "A consult can confirm your deadline.",
  "consult_urgency": "medium"
}
---END ROADMAP OVERLAY---`;
  const overlay = parseRoadmapOverlayFromModel(text);
  assert.equal(overlay.consult_recommended, true);
  assert.equal(overlay.consult_urgency, "medium");
  assert.equal(overlay.stage_notes?.file, "You mentioned filing — good progress.");
});

test("snapshotIsFresh rejects stale fingerprint", () => {
  const row: RoadmapSnapshotRow = {
    id: "1",
    case_file_id: "cf",
    user_id: "u",
    file_fingerprint: "abc",
    blueprint_key: "family-divorce",
    blueprint_version: "1",
    ai_overlay: {},
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  assert.equal(snapshotIsFresh(row, "abc", "family-divorce"), true);
  assert.equal(snapshotIsFresh(row, "different", "family-divorce"), false);
});
