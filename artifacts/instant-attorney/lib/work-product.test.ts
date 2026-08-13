import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAttorneyApproved } from "./doc-generator.ts";

/**
 * Scan code, not prose. These routes explain in comments the states they
 * deliberately do NOT set — "submitted_at stays null", "would put their own
 * draft in their own queue" — and a raw text search reads those explanations as
 * the thing they warn against. Explaining a rule must not read as breaking it.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

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

test("download refuses an unapproved attorney-originated draft to a non-attorney", async () => {
  // Same rule, other origin. The attorney starts this one from the client's
  // file, so the row is owned by the client and the ownership check passes —
  // but the client never asked for it and has not been shown it. Approval is
  // what makes it theirs, exactly as with the working copy.
  const src = stripComments(await readFile("app/api/documents/[id]/download/route.ts", "utf8"));
  const flat = src.replace(/\s+/g, " ");

  assert.match(flat, /source === ATTORNEY_ORIGINATED/);
  assert.match(
    flat,
    /source === ATTORNEY_ORIGINATED && !profile\?\.is_attorney && !isAttorneyApproved\(doc\.status\)/,
    "all three conditions must hold: attorney-originated, non-attorney caller, not approved"
  );
});

test("an attorney-originated draft never enters the review queue", async () => {
  // The attorney is the author. Stamping it pending_review would put their own
  // draft in their own queue, on a 48-hour clock meant for client submissions.
  const src = stripComments(await readFile("app/api/attorney/case-files/[id]/draft/route.ts", "utf8"));
  const flat = src.replace(/\s+/g, " ");

  assert.match(flat, /status: "draft"/);
  assert.doesNotMatch(flat, /pending_review/);
  assert.doesNotMatch(flat, /submitted_at/);
  assert.doesNotMatch(
    flat,
    /finalizeDocumentSubmission/,
    "submission is the client's act; the attorney's draft must not fake one"
  );
});

test("the attorney draft route generates through the one engine and the one boundary", async () => {
  const src = await readFile("app/api/attorney/case-files/[id]/draft/route.ts", "utf8");
  assert.match(src, /draftInstrument\(/, "must not be a second drafting implementation");
  assert.match(src, /saveDocumentRevision\(/, "must not be a ninth document write path");
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
