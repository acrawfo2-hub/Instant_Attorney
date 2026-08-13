import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAttorneyApproved } from "./doc-generator.ts";

/**
 * The attorney's working copy is privileged until it is approved.
 *
 * A submitted document gets a `second_draft` CHILD row that the attorney edits.
 * `app/attorney/review/[id]` autosaves into it on every pause and again on
 * unload via sendBeacon, so mid-review its text is whatever the last keystroke
 * left behind — a half-applied instruction, a clause still under consideration,
 * a version that would have been reverted a minute later.
 *
 * The client owns the PARENT document, and the ownership check on
 * `/api/documents/[id]/download` is `doc.user_id !== userId`. The child carries
 * the same `user_id`, so ownership alone let the client fetch it, and
 * `CaseDocumentsTable` offered them the link. Approval is what makes that text
 * theirs to read.
 *
 * This pins the server side. The hidden link is a courtesy; the 409 is the
 * boundary.
 */

test("approval is what makes a working copy readable", () => {
  assert.equal(isAttorneyApproved("draft"), false);
  assert.equal(isAttorneyApproved("pending_review"), false);
  assert.equal(isAttorneyApproved("changes_requested"), false);
  assert.equal(isAttorneyApproved("approved"), true);
  assert.equal(isAttorneyApproved("delivered"), true);
});

test("download refuses an unapproved working copy to a non-attorney", async () => {
  const src = await readFile("app/api/documents/[id]/download/route.ts", "utf8");
  const flat = src.replace(/\s+/g, " ");

  // All four conditions must be present: it is a child, it is the working copy,
  // the caller is not an attorney, and it is not approved. Dropping any one of
  // them either reopens the leak or locks the attorney out of their own draft.
  assert.match(flat, /doc\.parent_document_id/);
  assert.match(flat, /doc\.doc_type === "second_draft"/);
  assert.match(flat, /!profile\?\.is_attorney/);
  assert.match(flat, /!isAttorneyApproved\(doc\.status\)/);

  assert.match(
    flat,
    /status: 409/,
    "an unapproved working copy must be refused, not served"
  );
});

test("the documents table does not offer an unapproved working copy to a client", async () => {
  const src = await readFile("components/CaseDocumentsTable.tsx", "utf8");
  const links = [...src.matchAll(/\{secondDraft\?\.draft_text[^\n]*\n[^\n]*download`\}/g)];

  assert.ok(links.length > 0, "expected the revised-draft download links to still exist");
  for (const [link] of links) {
    assert.match(
      link,
      /isAttorney \|\| isAttorneyApproved\(secondDraft\.status\)/,
      `a revised-draft link is offered without checking approval:\n${link}`
    );
  }
});
