import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeStagedStarter,
  drainStagedStarter,
  type StagedRef,
  type StagedStarter,
} from "./starter-fold.ts";

// These tests lock in the wizard's starter-answer flow: a client can hit Save
// repeatedly — including WHILE an earlier fold is still awaiting async work — and
// no saved answer is ever dropped (merge by label + bounded re-check loop).

// ── merge ────────────────────────────────────────────────────────────────────
test("mergeStagedStarter keeps both batches, latest value wins per label", () => {
  const prev: StagedStarter = {
    filled: [
      { label: "Party A", value: "Acme" },
      { label: "Amount", value: "$100" },
    ],
    note: "first note",
  };
  const merged = mergeStagedStarter(
    prev,
    [
      { label: "Amount", value: "$250" }, // overrides
      { label: "Party B", value: "Beta" }, // new
    ],
    "second note"
  );
  const byLabel = Object.fromEntries(merged.filled.map((a) => [a.label, a.value]));
  assert.deepEqual(byLabel, { "Party A": "Acme", Amount: "$250", "Party B": "Beta" });
  assert.equal(merged.note, "first note\nsecond note");
});

test("mergeStagedStarter from an empty/null prior keeps the new batch and omits empty notes", () => {
  const merged = mergeStagedStarter(null, [{ label: "X", value: "1" }], "");
  assert.deepEqual(merged.filled, [{ label: "X", value: "1" }]);
  assert.equal(merged.note, "");
});

// ── drain loop ───────────────────────────────────────────────────────────────
test("drainStagedStarter folds answers staged mid-fold without dropping any", async () => {
  // Simulate: an initial batch is staged; while the first fold is awaiting async
  // work, the client saves a second batch (merged into the ref). The bounded loop
  // must pick the second batch up on a later pass.
  const ref: StagedRef = {
    current: { filled: [{ label: "A", value: "1" }], note: "" },
  };
  const foldedLabels: string[] = [];
  let foldCount = 0;

  async function fold(staged: StagedStarter): Promise<void> {
    foldCount += 1;
    // Mid-fold async work — yield to the event loop.
    await Promise.resolve();
    for (const a of staged.filled) foldedLabels.push(a.label);
    // On the first fold only, a new save lands while we were awaiting.
    if (foldCount === 1) {
      ref.current = mergeStagedStarter(ref.current, [{ label: "B", value: "2" }], "");
    }
  }

  await drainStagedStarter(ref, fold);

  assert.deepEqual(foldedLabels.sort(), ["A", "B"]);
  assert.equal(ref.current, null, "ref fully drained");
  assert.equal(foldCount, 2, "a second pass ran to fold the mid-fold save");
});

test("drainStagedStarter returns immediately when nothing is staged", async () => {
  const ref: StagedRef = { current: null };
  let called = 0;
  await drainStagedStarter(ref, async () => {
    called += 1;
  });
  assert.equal(called, 0);
});

test("drainStagedStarter is bounded — it stops after maxPasses even if saves keep arriving", async () => {
  // Pathological: every fold re-stages a new answer. The loop must terminate.
  const ref: StagedRef = { current: { filled: [{ label: "A0", value: "0" }], note: "" } };
  let n = 0;
  await drainStagedStarter(
    ref,
    async () => {
      n += 1;
      ref.current = { filled: [{ label: `A${n}`, value: String(n) }], note: "" };
    },
    5
  );
  assert.equal(n, 5, "loop runs exactly maxPasses times and then stops");
});
