import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTableDefinitions,
  parseCodeTableReferences,
  findCollisions,
  runSchemaGuard,
} from "./schema-guard.ts";

// ── Parsing ──────────────────────────────────────────────────────────────────

test("parses table name and columns, skipping constraint lines", () => {
  const defs = parseTableDefinitions(
    `create table if not exists public.widgets (
       id uuid default gen_random_uuid() primary key,
       case_file_id uuid references case_files(id) on delete cascade not null,
       price numeric(10,2) not null check (price >= 0),
       status text not null check (status in ('a','b')),
       unique(case_file_id, status),
       constraint widgets_price_ck check (price < 100)
     );`,
    "m.sql",
  );
  assert.equal(defs.length, 1);
  assert.equal(defs[0].table, "widgets");
  // unique(...) and constraint ... are constraints, not columns.
  assert.deepEqual(defs[0].columns, ["case_file_id", "id", "price", "status"]);
});

test("nested parens do not truncate the table body", () => {
  const defs = parseTableDefinitions(
    `create table t (
       id uuid primary key,
       kind text not null check (kind in ('x','y','z')),
       tail text
     );`,
    "m.sql",
  );
  assert.ok(defs[0].columns.includes("tail"), "column after a nested check() must still parse");
});

test("reads table references out of .from() call sites", () => {
  const refs = parseCodeTableReferences(
    `await db.from("documents").select("*"); await db.from('document_revisions').insert({});`,
  );
  assert.deepEqual(refs.sort(), ["document_revisions", "documents"]);
});

// ── Collisions: both regressions this guard exists for ───────────────────────

test("collision: incompatible redefinitions of the same table are reported", () => {
  // #99 vs #102 on document_generation_jobs, reduced to the shape that matters.
  const defs = [
    ...parseTableDefinitions(
      `create table if not exists document_generation_jobs (
         id uuid primary key, case_file_id uuid, document_type text,
         scheduling_priority integer, launch_reason text, plan_confidence text);`,
      "stage46-policy.sql",
    ),
    ...parseTableDefinitions(
      `create table if not exists document_generation_jobs (
         id uuid primary key, case_file_id uuid, document_type text,
         idempotency_key text, plan_revision bigint, title text);`,
      "stage47-jobs.sql",
    ),
  ];
  const [c] = findCollisions(defs);
  assert.ok(c, "an incompatible redefinition must be reported");
  assert.equal(c.table, "document_generation_jobs");
  assert.deepEqual(c.files, ["stage46-policy.sql", "stage47-jobs.sql"]);
  assert.deepEqual(c.sharedColumns, ["case_file_id", "document_type", "id"]);
  for (const col of ["idempotency_key", "launch_reason", "plan_confidence", "plan_revision", "scheduling_priority", "title"]) {
    assert.ok(c.divergentColumns.includes(col), `${col} should be flagged as divergent`);
  }
});

test("collision: #120 vs #129 document_revisions, sharing only three columns", () => {
  const defs = [
    ...parseTableDefinitions(
      `create table if not exists document_revisions (
         id uuid primary key, document_id uuid, created_at timestamptz,
         revision_number integer, draft_text text not null, reason text not null);`,
      "stage46-document-revisions.sql",
    ),
    ...parseTableDefinitions(
      `create table if not exists document_revisions (
         id uuid primary key, document_id uuid, created_at timestamptz,
         content text not null, title text not null, author_type text not null);`,
      "stage48-document-revisions.sql",
    ),
    ];
  const [c] = findCollisions(defs);
  assert.equal(c.table, "document_revisions");
  assert.deepEqual(c.sharedColumns, ["created_at", "document_id", "id"]);
  // draft_text is NOT NULL in one and absent from the other — the exact reason
  // the second definition's inserts would fail.
  assert.ok(c.divergentColumns.includes("draft_text"));
  assert.ok(c.divergentColumns.includes("content"));
});

test("identical restatements are not collisions", () => {
  // schema.sql and the catch-up files deliberately restate tables so a fresh
  // database can be built in one pass. Flagging those would make the guard noise.
  const sql = `create table if not exists documents (id uuid primary key, title text, draft_text text);`;
  const defs = [
    ...parseTableDefinitions(sql, "schema.sql"),
    ...parseTableDefinitions(sql, "schema-catch-up-current.sql"),
  ];
  assert.deepEqual(findCollisions(defs), []);
});

test("column order and formatting differences are not collisions", () => {
  const defs = [
    ...parseTableDefinitions(`create table t (id uuid primary key, a text, b text);`, "one.sql"),
    ...parseTableDefinitions(`create table t (\n  b text,\n  id uuid primary key,\n  a text\n);`, "two.sql"),
  ];
  assert.deepEqual(findCollisions(defs), []);
});

// ── Undefined tables ─────────────────────────────────────────────────────────

test("reports tables the code queries that no migration creates", () => {
  const result = runSchemaGuard(
    [{ file: "m.sql", sql: `create table documents (id uuid primary key);` }],
    [`db.from("documents").select(); db.from("document_sections").insert({});`],
  );
  assert.deepEqual(result.undefinedTables, ["document_sections"]);
});

test("ignore list suppresses views and other non-migration relations", () => {
  const result = runSchemaGuard(
    [{ file: "m.sql", sql: `create table documents (id uuid primary key);` }],
    [`db.from("documents").select(); db.from("some_view").select();`],
    { ignoreTables: ["some_view"] },
  );
  assert.deepEqual(result.undefinedTables, []);
});

test("a clean repo produces no findings", () => {
  const result = runSchemaGuard(
    [{ file: "m.sql", sql: `create table documents (id uuid primary key, title text);` }],
    [`db.from("documents").select("title");`],
  );
  assert.deepEqual(result.collisions, []);
  assert.deepEqual(result.undefinedTables, []);
  assert.deepEqual(result.undefinedColumns, []);
});

// ── Constraint keywords vs. column names ─────────────────────────────────────

test("a column whose name starts with a constraint keyword is still a column", () => {
  // `check_type` was being dropped as if it were a `check (...)` constraint, on
  // both document_qa tables. A silently dropped column is worse than a noisy
  // one: findCollisions compares column sets, so a column invisible in every
  // definition can diverge between migrations without ever being reported.
  const [def] = parseTableDefinitions(
    `create table qa (
       id uuid primary key,
       check_type text not null check (check_type in ('a','b')),
       unique_ref text,
       constraint_note text,
       like_count integer,
       unique (id, check_type)
     );`,
    "m.sql",
  );
  assert.deepEqual(def.columns, [
    "check_type", "constraint_note", "id", "like_count", "unique_ref",
  ]);
});

// ── Undefined columns ────────────────────────────────────────────────────────

test("reports columns the code selects that no migration defines", () => {
  const result = runSchemaGuard(
    [{ file: "m.sql", sql: `create table fact_items (id uuid primary key, description text);` }],
    [`db.from("fact_items").select("description,fact_text");`],
    { sourceNames: ["lib/worker.ts"] },
  );
  assert.deepEqual(result.undefinedColumns, [
    { table: "fact_items", column: "fact_text", files: ["lib/worker.ts"] },
  ]);
});

test("columns added by a later alter table count as defined", () => {
  const result = runSchemaGuard(
    [
      { file: "a.sql", sql: `create table subscriptions (id uuid primary key);` },
      // One statement, several columns — the shape most of this schema uses.
      { file: "b.sql", sql: `alter table subscriptions
          add column if not exists plan text,
          add column if not exists consult_credits integer not null default 0;` },
    ],
    [`db.from("subscriptions").select("plan, consult_credits");`],
  );
  assert.deepEqual(result.undefinedColumns, []);
});

test("select lists the guard cannot read are skipped, not guessed at", () => {
  const result = runSchemaGuard(
    [{ file: "m.sql", sql: `create table documents (id uuid primary key, title text);` }],
    [
      `db.from("documents").select("*, revisions(id)");`,   // star + embed
      `db.from("documents").select("name:title");`,          // alias
      `db.from("documents").select(cols);`,                  // not a literal
    ],
  );
  assert.deepEqual(result.undefinedColumns, []);
});

test("a column on a table no migration defines is reported once, as a table", () => {
  // Otherwise an unknown table reports again for each column selected from it.
  const result = runSchemaGuard(
    [{ file: "m.sql", sql: `create table documents (id uuid primary key);` }],
    [`db.from("ghost_table").select("a, b, c");`],
  );
  assert.deepEqual(result.undefinedTables, ["ghost_table"]);
  assert.deepEqual(result.undefinedColumns, []);
});
