import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTATE_TASKS,
  CHECKLIST_CATEGORIES,
  getEstateTask,
  isKnownEstateTaskKey,
  tasksByCategory,
  selfServiceCount,
  estateChecklistDisclaimer,
} from "./estate-checklist.ts";
import { isKnownEstateStatuteKey } from "./estate-statutes.ts";

const VALID_CATEGORIES = CHECKLIST_CATEGORIES.map((c) => c.key);
const VALID_DOERS = ["you", "together", "attorney"];

test("every task has complete fields and resolvable statute references", () => {
  assert.ok(ESTATE_TASKS.length >= 1);
  for (const t of ESTATE_TASKS) {
    assert.ok(t.title && t.detail, `${t.key} core fields`);
    assert.ok(VALID_CATEGORIES.includes(t.category), `${t.key} category`);
    assert.ok(VALID_DOERS.includes(t.doer), `${t.key} doer`);
    for (const k of t.relevant_statutes) assert.ok(isKnownEstateStatuteKey(k), `${t.key} bad statute ${k}`);
  }
});

test("task keys are unique", () => {
  const keys = ESTATE_TASKS.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("most of the work is the client's own to do (the non-legal emphasis)", () => {
  // The whole point: estate prep is mostly self-service. A majority of tasks
  // must be tagged "you".
  assert.ok(selfServiceCount() > ESTATE_TASKS.length / 2, "majority should be self-service");
});

test("the practical priorities the user called out are present", () => {
  // Passwords prepared, willing to move money, set up beneficiaries.
  assert.ok(isKnownEstateTaskKey("password_inventory"));
  assert.ok(isKnownEstateTaskKey("fund_trust"));
  assert.ok(isKnownEstateTaskKey("update_beneficiaries"));
  assert.ok(isKnownEstateTaskKey("add_pod_tod"));
});

test("the What-If game is a first-class task and is the client's to do", () => {
  const wi = getEstateTask("play_what_if");
  assert.ok(wi, "what-if task present");
  assert.equal(wi.category, "whatif");
  assert.equal(wi.doer, "you");
  assert.match(wi.detail, /what.?if/i);
});

test("grouping returns non-empty groups covering every task, in category order", () => {
  const groups = tasksByCategory();
  assert.ok(groups.length >= 1);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  assert.equal(total, ESTATE_TASKS.length, "every task is grouped exactly once");
  for (const g of groups) assert.ok(g.tasks.length > 0, `${g.category.key} non-empty`);
  // Order follows CHECKLIST_CATEGORIES.
  const order = groups.map((g) => VALID_CATEGORIES.indexOf(g.category.key));
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], "category order preserved");
});

test("lookup + disclaimer", () => {
  assert.equal(getEstateTask("nope"), undefined);
  assert.ok(!isKnownEstateTaskKey("nope"));
  assert.match(estateChecklistDisclaimer(), /not legal advice/i);
});
