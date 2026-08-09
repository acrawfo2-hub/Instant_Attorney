import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDraftFocus, missingDraftNotice } from "./draft-focus.ts";
import type { ClientWorkspaceDraft } from "./types.ts";

function draft(over: Partial<ClientWorkspaceDraft>): ClientWorkspaceDraft {
  return {
    id: "w1", case_file_id: "cf1", user_id: "u1", title: "Draft", content: "Body",
    source: "assistant", promoted_document_id: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...over,
  } as unknown as ClientWorkspaceDraft;
}

const A = draft({ id: "a", title: "Original Answer" });
const B = draft({ id: "b", title: "Inventory" });

test("no request: keeps the draft already open so a refresh can't yank the reader away", () => {
  assert.deepEqual(resolveDraftFocus([A, B], "b", null), { kind: "none", activeId: "b" });
});

test("no request, nothing open: falls back to the newest draft", () => {
  assert.deepEqual(resolveDraftFocus([A, B], null, null), { kind: "none", activeId: "a" });
});

test("no request, the open draft is gone: falls back rather than showing nothing", () => {
  assert.deepEqual(resolveDraftFocus([A, B], "deleted", null), { kind: "none", activeId: "a" });
});

test("empty list with no request yields no selection", () => {
  assert.deepEqual(resolveDraftFocus([], null, null), { kind: "none", activeId: null });
});

test("focus by id selects that draft", () => {
  assert.deepEqual(resolveDraftFocus([A, B], "a", { id: "b" }), { kind: "focused", activeId: "b" });
});

test("focus by title selects that draft — the in-chat chip only knows the title", () => {
  assert.deepEqual(resolveDraftFocus([A, B], null, { title: "Inventory" }), { kind: "focused", activeId: "b" });
});

test("id wins over title when both are given and disagree", () => {
  const out = resolveDraftFocus([A, B], null, { id: "a", title: "Inventory" });
  assert.deepEqual(out, { kind: "focused", activeId: "a" });
});

test("a requested draft that is gone reports 'missing' instead of silently showing another", () => {
  const out = resolveDraftFocus([A, B], null, { id: "vanished", title: "Demand Letter" });
  assert.equal(out.kind, "missing");
  assert.equal(out.activeId, "a", "still shows something, but the caller must say why");
  assert.equal(out.kind === "missing" && out.requested, "Demand Letter");
});

test("a requested draft missing from an empty list selects nothing", () => {
  const out = resolveDraftFocus([], null, { id: "vanished" });
  assert.equal(out.kind, "missing");
  assert.equal(out.activeId, null);
});

test("blank/whitespace focus fields are treated as no request", () => {
  assert.equal(resolveDraftFocus([A], null, { id: "  ", title: "" }).kind, "none");
});

test("the missing-draft notice points somewhere useful in both cases", () => {
  assert.match(missingDraftNotice("Original Answer", true), /Original Answer/);
  assert.match(missingDraftNotice("Original Answer", true), /most recent draft/);
  assert.match(missingDraftNotice("Original Answer", false), /Documents/);
});
