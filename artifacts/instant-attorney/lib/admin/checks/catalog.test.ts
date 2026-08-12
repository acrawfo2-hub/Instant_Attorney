import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { CHECK_CATALOG, findCheck } from "./catalog.ts";
import { CHECK_GROUPS, worstStatus } from "./types.ts";

/**
 * Hygiene rules for the check registry.
 *
 * The point of a registry is that adding a failure mode is adding an entry, not
 * editing a page — which only holds if entries cannot rot. These tests are what
 * stop the catalog drifting away from the runners and the memory files.
 *
 * `runners.ts` imports `@/lib/...` so node:test cannot load it; the binding
 * check reads it as source instead. Coarse, but it catches the real drift: an
 * entry added to the catalog with no runner written for it.
 */

const here = dirname(fileURLToPath(import.meta.url));
// checks → admin → lib → instant-attorney → artifacts → repo root
const repoRoot = resolve(here, "../../../../..");

function runnerIds(): string[] {
  const src = readFileSync(resolve(here, "runners.ts"), "utf8");
  const block = src.match(/export const RUNNERS[^{]*\{([\s\S]*?)\n\};/);
  assert.ok(block, "could not locate the RUNNERS map in runners.ts");
  return [...block[1].matchAll(/"([a-z-]+\.[a-z-]+)"\s*:/g)].map((m) => m[1]);
}

test("check ids are unique", () => {
  const ids = CHECK_CATALOG.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate check id");
});

test("check ids are namespaced group.name and match their declared group", () => {
  for (const c of CHECK_CATALOG) {
    assert.match(c.id, /^[a-z-]+\.[a-z-]+$/, `${c.id} should look like group.name`);
    assert.equal(c.id.split(".")[0], c.group, `${c.id} does not match group '${c.group}'`);
  }
});

test("every check declares a known group", () => {
  for (const c of CHECK_CATALOG) {
    assert.ok(CHECK_GROUPS.includes(c.group), `${c.id} has unknown group '${c.group}'`);
  }
});

test("every check says what breaks when it goes red", () => {
  for (const c of CHECK_CATALOG) {
    assert.ok(c.title.length > 0, `${c.id} has no title`);
    assert.ok(
      c.matters.length >= 40,
      `${c.id} needs a real 'matters' explanation — a red row with no stakes is noise`
    );
  }
});

test("every declared memo file exists", () => {
  for (const c of CHECK_CATALOG) {
    if (!c.memo) continue;
    assert.ok(
      existsSync(resolve(repoRoot, c.memo)),
      `${c.id} points at a missing memo: ${c.memo}`
    );
  }
});

test("every catalog entry has a runner, and every runner has a catalog entry", () => {
  const catalogIds = CHECK_CATALOG.map((c) => c.id).sort();
  const bound = runnerIds().sort();

  const unbound = catalogIds.filter((id) => !bound.includes(id));
  const orphaned = bound.filter((id) => !catalogIds.includes(id));

  assert.deepEqual(unbound, [], `catalog entries with no runner: ${unbound.join(", ")}`);
  assert.deepEqual(orphaned, [], `runners with no catalog entry: ${orphaned.join(", ")}`);
});

test("timeouts are sane where declared", () => {
  for (const c of CHECK_CATALOG) {
    if (c.timeoutMs === undefined) continue;
    assert.ok(c.timeoutMs >= 1000, `${c.id} timeout is too tight`);
    assert.ok(c.timeoutMs <= 30000, `${c.id} timeout would stall the board`);
  }
});

test("findCheck resolves ids and rejects unknown ones", () => {
  assert.equal(findCheck("database.schema")?.group, "database");
  assert.equal(findCheck("nope.nope"), undefined);
});

test("the three invisible failure classes are all covered", () => {
  // These are the ones nothing in the product surfaces on its own. If a future
  // refactor drops one, the board silently stops earning its keep.
  for (const id of ["database.schema", "routing.api-shadow", "config.model-pricing"]) {
    assert.ok(findCheck(id), `${id} must stay in the catalog`);
  }
});

test("worstStatus ranks fail over warn over ok, ignoring skip", () => {
  assert.equal(worstStatus(["ok", "warn", "fail"]), "fail");
  assert.equal(worstStatus(["ok", "warn"]), "warn");
  assert.equal(worstStatus(["ok", "skip"]), "ok");
  assert.equal(worstStatus(["skip"]), "skip");
  assert.equal(worstStatus([]), "skip");
});
