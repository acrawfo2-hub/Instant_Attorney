import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CONSULT_SHORTCUTS, consultShortcutById } from "./consult-shortcuts.ts";
import { CONSULT_ASSOCIATE_TOOLS } from "./consult-associate-tools.ts";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("consult shortcuts never approve, send, or end the session", () => {
  assert.deepEqual(
    CONSULT_SHORTCUTS.map((item) => item.id),
    ["brief", "fee", "closeout", "memo", "explain"],
  );
  for (const item of CONSULT_SHORTCUTS) {
    assert.doesNotMatch(item.instruction, /\bapprove\b/i);
    assert.doesNotMatch(item.instruction, /\bsend\b/i);
    assert.doesNotMatch(item.instruction, /\bend session\b/i);
  }
  assert.equal(consultShortcutById("fee")?.label, "Fee guidance");
  assert.equal(consultShortcutById("nope"), undefined);
});

test("consult associate tools are existing specialists, not a second engine", async () => {
  assert.deepEqual(
    CONSULT_ASSOCIATE_TOOLS.map((tool) => tool.name),
    ["get_consult_context", "run_consult_brief", "run_fee_estimate", "draft_closeout", "generate_preconsult_memo"],
  );
  for (const tool of CONSULT_ASSOCIATE_TOOLS) {
    assert.match(tool.description, /does not/i);
  }
  const toolsSrc = stripComments(await readFile(new URL("./consult-associate-tools.ts", import.meta.url), "utf8"));
  assert.match(toolsSrc, /buildConsultBriefSnapshot/);
  assert.match(toolsSrc, /buildConsultFeeEstimate/);
  assert.match(toolsSrc, /buildConsultCloseoutDraft/);
  assert.match(toolsSrc, /generatePreConsultMemo/);
  assert.doesNotMatch(toolsSrc, /generateConsultCloseoutDraft/);
  assert.doesNotMatch(toolsSrc, /applyWrapUpToLivingFile/);
});

test("consult chat never writes wrap-up, never sends, never ends the session", async () => {
  const src = stripComments(await readFile(new URL("../app/api/attorney/consult/[id]/chat/route.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(src, /applyWrapUpToLivingFile/);
  assert.doesNotMatch(src, /session_started_at/);
  assert.doesNotMatch(src, /session_ended_at/);
  assert.doesNotMatch(src, /saveDocumentRevision\(/);
  assert.doesNotMatch(src, /buildDrafterSystemPrompt/);
  assert.doesNotMatch(src, /\.update\(/);
  assert.match(src, /CONSULT_ASSOCIATE_TOOLS/);
  assert.match(src, /attorney_consult_messages/);
});

test("consult workbench does not import the associate server graph", async () => {
  const session = stripComments(await readFile(new URL("../components/ConsultSessionView.tsx", import.meta.url), "utf8"));
  const brief = stripComments(await readFile(new URL("../components/ConsultBriefPanel.tsx", import.meta.url), "utf8"));
  const chat = stripComments(await readFile(new URL("../components/ConsultAssociateChat.tsx", import.meta.url), "utf8"));
  for (const src of [session, brief, chat]) {
    assert.doesNotMatch(src, /from ["']@\/lib\/consult-associate-tools["']/);
    assert.match(src, /ConsultAssociateChat|consult-shortcuts/);
  }
});
