import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDrafts, planAssistantDraftPersistence } from "./freestyle-drafts.ts";

const assistantDraft = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  source: "assistant",
  content: "Original assistant text",
  promoted_document_id: null,
  ...overrides,
});

test("same-title assistant output may update one untouched assistant draft", () => {
  const action = planAssistantDraftPersistence(
    { title: "Demand Letter", content: "Updated" },
    [assistantDraft("draft-1")],
  );
  assert.deepEqual(action, { kind: "update", id: "draft-1" });
});

test("assistant output cannot overwrite a client-edited draft", () => {
  const action = planAssistantDraftPersistence(
    { title: "Demand Letter", content: "Assistant proposal", draftId: "draft-1" },
    [assistantDraft("draft-1", { source: "client", content: "Client's protected edit" })],
  );
  assert.deepEqual(action, {
    kind: "insert",
    title: "Demand Letter (Assistant revision)",
    revisionOfDraftId: "draft-1",
  });
});

test("assistant output cannot silently alter a promoted draft", () => {
  const action = planAssistantDraftPersistence(
    { title: "Demand Letter", content: "Assistant proposal", draftId: "draft-1" },
    [assistantDraft("draft-1", { promoted_document_id: "document-in-review" })],
  );
  assert.equal(action.kind, "insert");
  assert.equal(action.kind === "insert" && action.revisionOfDraftId, "draft-1");
});

test("two distinct documents with the same title remain distinct", () => {
  const rows = [assistantDraft("draft-1"), assistantDraft("draft-2")];
  assert.deepEqual(
    planAssistantDraftPersistence({ title: "Agreement", content: "A new document" }, rows),
    { kind: "insert", title: "Agreement" },
  );
  assert.deepEqual(
    planAssistantDraftPersistence(
      { title: "Agreement", content: "Only document two", draftId: "draft-2" },
      rows,
    ),
    { kind: "update", id: "draft-2" },
  );
});

test("draft protocol extracts a stable draft id without changing the title", () => {
  const [draft] = parseDrafts(
    "---DRAFT: Agreement [draft-id: 123e4567-e89b-12d3-a456-426614174000]---\nBody\n---END DRAFT---",
  );
  assert.deepEqual(draft, {
    title: "Agreement",
    content: "Body",
    draftId: "123e4567-e89b-12d3-a456-426614174000",
  });
});
