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
});
