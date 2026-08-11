import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const revisionRoutes = [
  "app/api/wizard/route.ts",
  "app/api/documents/[id]/regenerate/route.ts",
  "app/api/workspace/drafts/[id]/promote/route.ts",
  "app/api/attorney/documents/[id]/chat-edit/route.ts",
  "app/api/attorney/documents/[id]/second-draft/route.ts",
];

test("every ordinary, truncated, promoted, attorney-edit and second-draft save uses the revision boundary", async () => {
  for (const route of revisionRoutes) {
    const source = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.match(source, /saveDocumentRevision\(/, `${route} bypasses saveDocumentRevision`);
  }
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
