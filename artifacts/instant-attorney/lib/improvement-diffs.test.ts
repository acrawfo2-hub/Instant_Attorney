import assert from "node:assert/strict";
import test from "node:test";
import { affectsAuthorities, applyImprovementDiff, createImprovementDiff, locateImprovementRange } from "./improvement-diffs.ts";

const draft = "Preamble text.\n\nSection 3. Tenant must provide ten days notice.\n\nSignature block.";

test("creates an anchored preview without changing source and applies it exactly once", () => {
  const anchor = locateImprovementRange(draft, { section: "Section 3", title: "Extend notice" });
  assert.equal(anchor.quote, "Section 3. Tenant must provide ten days notice.");
  const diff = createImprovementDiff(draft, anchor, "Section 3. Tenant must provide thirty days notice.");
  assert.equal(draft.includes("ten days"), true);
  assert.match(applyImprovementDiff(draft, diff), /thirty days/);
  assert.throws(() => applyImprovementDiff(`${draft} changed`, diff), /working revision changed/);
});

test("selectively identifies authority-affecting passage diffs", () => {
  const anchor = locateImprovementRange(draft, { section: "Section 3" });
  assert.equal(affectsAuthorities(createImprovementDiff(draft, anchor, "Clearer notice language.")), false);
  assert.equal(affectsAuthorities(createImprovementDiff(draft, anchor, "Apply Tex. Code § 1.01.")), true);
});
