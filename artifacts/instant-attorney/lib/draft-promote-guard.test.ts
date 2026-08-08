import { test } from "node:test";
import assert from "node:assert/strict";
import { runPromoteWithSaveGuard } from "./draft-promote-guard.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeOpts({
  inFlightSave = null,
  dirty = false,
  saveOk = true,
  promoteCalled = { v: false },
}: {
  inFlightSave?: Promise<boolean> | null;
  dirty?: boolean;
  saveOk?: boolean;
  promoteCalled?: { v: boolean };
}) {
  let currentDirty = dirty;
  const save = async () => {
    if (saveOk) currentDirty = false;
    return saveOk;
  };
  const promote = async () => {
    promoteCalled.v = true;
  };
  return { inFlightSave, isDirty: () => currentDirty, save, promote, promoteCalled };
}

// ── happy paths ───────────────────────────────────────────────────────────────

test("promotes immediately when not dirty and no in-flight save", async () => {
  const called = { v: false };
  const opts = makeOpts({ dirty: false, promoteCalled: called });
  const err = await runPromoteWithSaveGuard(opts);
  assert.equal(err, null);
  assert.equal(called.v, true);
});

test("saves first when dirty=true, then promotes", async () => {
  const called = { v: false };
  const opts = makeOpts({ dirty: true, saveOk: true, promoteCalled: called });
  const err = await runPromoteWithSaveGuard(opts);
  assert.equal(err, null);
  assert.equal(called.v, true);
});

test("awaits a successful in-flight save and then promotes", async () => {
  const called = { v: false };
  const inFlightSave = Promise.resolve(true);
  const opts = makeOpts({ inFlightSave, dirty: false, promoteCalled: called });
  const err = await runPromoteWithSaveGuard(opts);
  assert.equal(err, null);
  assert.equal(called.v, true);
});

// ── dirty-on-promote race ─────────────────────────────────────────────────────

test("dirty=true while in-flight save resolves: still saves once more if still dirty after", async () => {
  // Simulate: autosave fired, but user made another edit while it was in-flight.
  // After awaiting inFlightSave, isDirty() returns true (new unsaved edit).
  const called = { v: false };
  let extraDirty = true; // remains dirty even after in-flight save
  const inFlightSave = Promise.resolve(true);
  let freshSaveCalled = false;
  const opts = {
    inFlightSave,
    isDirty: () => extraDirty,
    save: async () => {
      freshSaveCalled = true;
      extraDirty = false;
      return true;
    },
    promote: async () => { called.v = true; },
  };
  const err = await runPromoteWithSaveGuard(opts);
  assert.equal(err, null);
  assert.equal(freshSaveCalled, true, "should trigger a fresh save for the new edit");
  assert.equal(called.v, true);
});

// ── failure paths ─────────────────────────────────────────────────────────────

test("blocks promote when dirty save fails", async () => {
  const called = { v: false };
  const opts = makeOpts({ dirty: true, saveOk: false, promoteCalled: called });
  const err = await runPromoteWithSaveGuard(opts);
  assert.ok(err !== null, "should return an error string");
  assert.ok(err!.includes("Couldn't save"), `error should mention save: ${err}`);
  assert.equal(called.v, false, "promote must NOT fire when save fails");
});

test("blocks promote when in-flight save resolves false (network error)", async () => {
  const called = { v: false };
  const inFlightSave = Promise.resolve(false); // autosave already failed
  const opts = makeOpts({ inFlightSave, dirty: false, promoteCalled: called });
  const err = await runPromoteWithSaveGuard(opts);
  assert.ok(err !== null);
  assert.ok(err!.includes("Couldn't save"));
  assert.equal(called.v, false);
});

test("blocks promote when in-flight save succeeds but subsequent dirty save fails", async () => {
  // in-flight ok, but user had new edit and that save fails
  const called = { v: false };
  const inFlightSave = Promise.resolve(true);
  const opts = {
    inFlightSave,
    isDirty: () => true, // still dirty after in-flight settled
    save: async () => false, // fresh save fails
    promote: async () => { called.v = true; },
  };
  const err = await runPromoteWithSaveGuard(opts);
  assert.ok(err !== null);
  assert.ok(err!.includes("Couldn't save"));
  assert.equal(called.v, false);
});
