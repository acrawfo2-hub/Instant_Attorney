import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildAcpSystemPrompt, ORCHESTRATOR_TOOLS_GUIDANCE } from "./prompts.ts";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("the case assistant always includes orchestrator pacing, not only in freestyle", () => {
  const prompt = buildAcpSystemPrompt(["family"], "client", { homeState: "TX" });
  assert.match(prompt, /CONVERSATION PACING/);
});

test("chat-acp does not gate tools or draft persistence on ChatMode", async () => {
  const src = stripComments(await readFile(new URL("../app/api/chat-acp/route.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(
    src,
    /useTools\s*=\s*mode/,
    "Orchestrator tools were gated on mode === \"freestyle\", so an intake body was a weaker assistant.",
  );
  assert.doesNotMatch(
    src,
    /mode\s*===\s*"freestyle"/,
    "Draft persistence and tool availability must not depend on a posted chat mode.",
  );
  assert.match(src, /ORCHESTRATOR_TOOLS/);
  assert.match(src, /ORCHESTRATOR_TOOLS_GUIDANCE/);
  assert.doesNotMatch(src, /chat_mode:\s*mode/);
});

test("calculators stay inline; durability is record_fact after the client confirms", () => {
  assert.match(ORCHESTRATOR_TOOLS_GUIDANCE, /CALL THE TOOL instead of computing/);
  assert.match(ORCHESTRATOR_TOOLS_GUIDANCE, /OFFER to save it \(record_fact\)/);
  assert.match(ORCHESTRATOR_TOOLS_GUIDANCE, /don't save it automatically/);
  assert.match(ORCHESTRATOR_TOOLS_GUIDANCE, /Want me to save that to your file\?/);
});
