import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readStoredTab, writeStoredTab, tabLsKey, VALID_TAB_IDS } from "./tab-storage.ts";

// ── localStorage mock ────────────────────────────────────────────────────────
// node:test runs in Node where localStorage doesn't exist. Install a minimal
// in-memory implementation before any test touches the helpers.

let store: Map<string, string>;

before(() => {
  store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem:    (k: string) => store.get(k) ?? null,
      setItem:    (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear:      () => { store.clear(); },
    },
  });
});

beforeEach(() => {
  store.clear();
});

// ── tabLsKey ─────────────────────────────────────────────────────────────────

describe("tabLsKey", () => {
  it("namespaces by case file ID", () => {
    assert.equal(tabLsKey("abc-123"), "lf-tab:abc-123");
  });
});

// ── VALID_TAB_IDS ────────────────────────────────────────────────────────────

describe("VALID_TAB_IDS", () => {
  it("contains the five canonical tab IDs", () => {
    for (const id of ["documents", "case-details", "facts", "strength", "help"]) {
      assert.ok(VALID_TAB_IDS.has(id), `expected ${id} to be valid`);
    }
  });
});

// ── readStoredTab ────────────────────────────────────────────────────────────

describe("readStoredTab", () => {
  it("returns null when nothing is stored", () => {
    assert.equal(readStoredTab("case-1"), null);
  });

  it("returns the stored tab when it is a valid ID", () => {
    store.set("lf-tab:case-1", "facts");
    assert.equal(readStoredTab("case-1"), "facts");
  });

  it("returns null for an unrecognised stored value", () => {
    store.set("lf-tab:case-1", "not-a-tab");
    assert.equal(readStoredTab("case-1"), null);
  });

  it("does not bleed across case file IDs — case B returns null when only case A has a stored tab", () => {
    // Core regression: switching from case A (Strength) to case B (no saved tab)
    // must produce null so the caller can fall back to "documents".
    writeStoredTab("case-A", "strength");
    assert.equal(readStoredTab("case-B"), null);
    // And the effect logic `readStoredTab(id) ?? "documents"` yields "documents":
    assert.equal(readStoredTab("case-B") ?? "documents", "documents");
  });
});

// ── writeStoredTab ───────────────────────────────────────────────────────────

describe("writeStoredTab", () => {
  it("persists a tab ID under the namespaced key", () => {
    writeStoredTab("case-1", "strength");
    assert.equal(store.get("lf-tab:case-1"), "strength");
  });

  it("overwrites an earlier value for the same case", () => {
    writeStoredTab("case-1", "facts");
    writeStoredTab("case-1", "help");
    assert.equal(store.get("lf-tab:case-1"), "help");
  });

  it("does not affect other case files", () => {
    writeStoredTab("case-1", "strength");
    writeStoredTab("case-2", "facts");
    assert.equal(store.get("lf-tab:case-1"), "strength");
    assert.equal(store.get("lf-tab:case-2"), "facts");
  });
});
