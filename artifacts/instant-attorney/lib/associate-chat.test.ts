import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("chat-edit never writes document text and allows an empty change set", async () => {
  const src = stripComments(await readFile(new URL("../app/api/attorney/documents/[id]/chat-edit/route.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(src, /saveDocumentRevision\(/);
  assert.doesNotMatch(src, /No change could be matched/);
  assert.match(src, /ASSOCIATE_TOOLS/);
  assert.match(src, /changes may be \[\]/);
});

test("approve and delivery require an informed override instead of disabling the act", async () => {
  const approve = stripComments(await readFile(new URL("../app/api/documents/[id]/approve/route.ts", import.meta.url), "utf8"));
  const delivery = stripComments(await readFile(new URL("../app/api/attorney/documents/[id]/delivery/route.ts", import.meta.url), "utf8"));
  assert.match(approve, /requiresOverride/);
  assert.match(approve, /override_rationale/);
  assert.match(delivery, /requiresOverride/);
  assert.doesNotMatch(approve, /waive each one before approving/);
  assert.doesNotMatch(delivery, /Resolve all outstanding authority warnings before sending/);
});
