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

test("the review workbench does not import the associate server graph", async () => {
  const page = stripComments(await readFile(new URL("../app/attorney/review/[id]/page.tsx", import.meta.url), "utf8"));
  const chat = stripComments(await readFile(new URL("../components/attorney-review/ReviewPartnerChat.tsx", import.meta.url), "utf8"));
  assert.doesNotMatch(page, /from ["']@\/lib\/associate-tools["']/);
  assert.doesNotMatch(chat, /from ["']@\/lib\/associate-tools["']/);
  assert.match(page, /from ["']@\/lib\/associate-shortcuts["']/);
  assert.match(chat, /from ["']@\/lib\/associate-shortcuts["']/);
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
