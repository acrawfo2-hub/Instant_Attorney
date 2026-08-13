import { test } from "node:test";
import assert from "node:assert/strict";
import { draftRevisionAction, nextRevisionMetadata, revisionUiMessage } from "./workspace-draft-revision.ts";

test("edits before promotion remain workspace-only", () => {
  assert.equal(draftRevisionAction(null), "unpromoted");
});

test("edits during review revise in place and identify the queue item as revised", () => {
  assert.equal(draftRevisionAction("pending_review"), "revise_in_place");
  const meta = nextRevisionMetadata({ workspace_revision: 2 }, "2026-08-11T00:00:00Z");
  assert.equal(meta.workspace_revision, 3);
  assert.equal(meta.attorney_queue_label, "Revised — review pending");
  assert.match(revisionUiMessage("revise_in_place"), /superseded.*review is pending/i);
});

test("edits after requested changes revise and re-enter review", () => {
  assert.equal(draftRevisionAction("changes_requested"), "revise_in_place");
});

test("edits after approval create a linked revision without mutating the approved artifact", () => {
  assert.equal(draftRevisionAction("approved"), "create_revision");
  assert.equal(draftRevisionAction("delivered"), "create_revision");
  const meta = nextRevisionMetadata({}, "2026-08-11T00:00:00Z", "approved-1");
  assert.equal(meta.previous_document_id, "approved-1");
  assert.match(revisionUiMessage("create_revision"), /approved version was not changed/i);
});
