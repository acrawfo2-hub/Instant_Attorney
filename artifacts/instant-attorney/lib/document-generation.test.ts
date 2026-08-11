import assert from "node:assert/strict";
import test from "node:test";
import { logicalDocumentKey, normalizeGenerationInputs } from "./document-generation.ts";

test("normalizes job inputs deterministically", () => {
  assert.deepEqual(normalizeGenerationInputs(
    [{ id: "z" }, { id: "a" }, { id: "a" }],
    [{ id: "b", updated_at: "2" }, { id: "a", updated_at: "1" }],
  ), {
    factKeys: ["a", "z"],
    attachmentVersions: [{ id: "a", version: "1" }, { id: "b", version: "2" }],
  });
});

test("uses an explicit stable key and retains a legacy title fallback", () => {
  assert.deepEqual(logicalDocumentKey("demand-letter | Revised Demand"), { key: "demand-letter", title: "Revised Demand" });
  assert.equal(logicalDocumentKey("Demand Letter").key, logicalDocumentKey("Demand Letter").key);
});
