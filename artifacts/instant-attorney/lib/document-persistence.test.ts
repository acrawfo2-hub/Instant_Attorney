import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { placeholderFillLifecycle } from "./document-persistence.ts";

const revisionWriters = [
  "app/api/wizard/route.ts",
  "app/api/documents/[id]/regenerate/route.ts",
  "app/api/documents/[id]/fill-info/route.ts",
  "app/api/workspace/drafts/[id]/promote/route.ts",
  "app/api/workspace/drafts/[id]/route.ts",
  // chat-edit is deliberately absent: under #123 it proposes changes and never
  // writes, so there is no save there to route through the boundary. The
  // attorney's write is the revision save below.
  "app/api/attorney/documents/[id]/revision/route.ts",
  "app/api/attorney/documents/[id]/revisions/route.ts",
  "app/api/attorney/documents/[id]/improvements/[improvementId]/route.ts",
  // The second draft is written by upsertSecondDraftChild, which owns the
  // boundary call so both of its callers inherit it. Assert the helper rather
  // than the route — the route no longer touches document text itself.
  "lib/document-utils.ts",
];

// Files that mention a draft_text key next to a documents query but do not
// write document text. Each needs a reason, because the scan below treats
// anything unlisted as a new write path that escaped the boundary.
const notDocumentWrites: Record<string, string> = {
  "app/api/attorney/documents/[id]/second-draft/route.ts":
    "returns improved_draft_text in its JSON response; the write is upsertSecondDraftChild's",
  "lib/attorney-review.ts":
    "builds an in-memory { ...parentDoc, draft_text } for prompting; its only write is upsertSecondDraftChild's",
};

async function sourceFilesUnder(dir: URL): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) found.push(...(await sourceFilesUnder(child)));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) found.push(child.pathname);
  }
  return found;
}

test("every ordinary, truncated, promoted, attorney-edit and second-draft save uses the revision boundary", async () => {
  for (const writer of revisionWriters) {
    const source = await readFile(new URL(`../${writer}`, import.meta.url), "utf8");
    assert.match(source, /saveDocumentRevision\(/, `${writer} bypasses saveDocumentRevision`);
  }
});

// The list above only protects paths we already know about. This catches the
// failure mode that actually happened: a route added later writes document text
// on its own, the Living File never hears about it, and nothing fails.
test("no unlisted file writes document text outside the boundary", async () => {
  const root = new URL("../", import.meta.url);
  const files = [
    ...(await sourceFilesUnder(new URL("app/", root))),
    ...(await sourceFilesUnder(new URL("lib/", root))),
  ];
  const rootPath = root.pathname;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (!/draft_text:/.test(source) || !/from\("documents"\)/.test(source)) continue;
    const relative = decodeURIComponent(file.slice(rootPath.length));
    if (relative in notDocumentWrites) continue;
    assert.ok(
      revisionWriters.includes(relative),
      `${relative} writes document text but is not a known revision writer. ` +
        "Route it through saveDocumentRevision and add it to revisionWriters, " +
        "or record why it is not a document write in notDocumentWrites.",
    );
  }
});

test("the second-draft route reaches the boundary through the shared helper", async () => {
  const source = await readFile(
    new URL("../app/api/attorney/documents/[id]/second-draft/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /upsertSecondDraftChild\(/);
  // A direct insert here would be a second write path for the same content.
  assert.doesNotMatch(source, /doc_type: "second_draft"/);
});

test("the shared boundary synchronizes placeholders with document and revision attribution", async () => {
  const source = await readFile(new URL("./document-persistence.ts", import.meta.url), "utf8");
  assert.match(source, /syncDraftGapsToLivingFile/);
  assert.match(source, /documentId,/);
  assert.match(source, /revisionId,/);
  assert.match(source, /living_file_sync_status: "failed"/);
});

test("revision-scoped gaps do not use case-wide description identity", async () => {
  const parser = await readFile(new URL("./file-parser.ts", import.meta.url), "utf8");
  assert.match(parser, /source_document_id: source\.documentId/);
  assert.match(parser, /source_revision_id: source\.revisionId/);
  assert.match(parser, /g\.source_document_id === source\.documentId/);
});

// ── placeholderFillLifecycle ───────────────────────────────────────────────
// These moved here with the function, from lib/document-revisions.ts. That
// module held three helpers; only this one had a caller. `isReviewResultCurrent`
// had none, and `statusAfterPlaceholderFill` restated in TypeScript a rule the
// `apply_document_placeholder_revision` RPC already enforces in SQL — so its
// test proved the copy agreed with itself, not with the code that runs.

test("an unsubmitted draft is filled in place", () => {
  assert.equal(placeholderFillLifecycle("draft"), "draft_in_place");
});

for (const status of ["pending_review", "changes_requested"] as const) {
  test(`${status} creates a review revision`, () => {
    assert.equal(placeholderFillLifecycle(status), "review_revision");
  });
}

for (const status of ["approved", "delivered"] as const) {
  test(`${status} preserves the approved version and requires a new approval`, () => {
    assert.equal(placeholderFillLifecycle(status), "approval_revision");
  });
}
