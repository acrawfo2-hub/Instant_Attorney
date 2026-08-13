import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSOCIATE_SHORTCUTS, ASSOCIATE_TOOLS, shortcutById } from "./associate-tools.ts";

test("shortcuts cover the six workbench specialists and none approve or send", () => {
  assert.deepEqual(
    ASSOCIATE_SHORTCUTS.map((item) => item.id),
    ["adversarial", "qa", "placeholders", "formatting", "authorities", "explain"],
  );
  for (const item of ASSOCIATE_SHORTCUTS) {
    assert.doesNotMatch(item.instruction, /\bapprove\b/i);
    assert.doesNotMatch(item.instruction, /\bsend\b/i);
  }
});

test("associate tools are the existing specialists, not a second write path", () => {
  assert.deepEqual(
    ASSOCIATE_TOOLS.map((tool) => tool.name),
    ["run_adversarial_review", "run_document_qa", "get_workbench_qa"],
  );
  for (const tool of ASSOCIATE_TOOLS) {
    assert.match(tool.description, /does not/i);
  }
  assert.equal(shortcutById("authorities")?.label, "Authorities");
  assert.equal(shortcutById("nope"), undefined);
});
