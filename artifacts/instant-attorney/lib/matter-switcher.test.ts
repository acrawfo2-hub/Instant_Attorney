import { test } from "node:test";
import assert from "node:assert/strict";
import { matterDisplayTitle, toMatterSwitcherItem } from "./matter-switcher.ts";

test("matterDisplayTitle prefers title, then subtype, then quick consult", () => {
  assert.equal(matterDisplayTitle({ title: "HOA fine dispute" }), "HOA fine dispute");
  assert.equal(matterDisplayTitle({ title: null, matter_subtype: "wage_claim" }), "wage claim");
  assert.equal(
    matterDisplayTitle({ title: null, matter_subtype: null, file_type: "quick_consult" }),
    "Quick consult",
  );
  assert.equal(matterDisplayTitle({}), "Untitled matter");
});

test("toMatterSwitcherItem maps next_action", () => {
  const item = toMatterSwitcherItem({
    id: "abc",
    title: "Debt defense",
    matter_subtype: null,
    matter_type: "reactive",
    file_type: "standard",
    next_action: "Upload the citation",
    updated_at: "2026-01-01T00:00:00Z",
  });
  assert.equal(item.id, "abc");
  assert.equal(item.title, "Debt defense");
  assert.equal(item.next_action, "Upload the citation");
});
