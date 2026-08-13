// Schema guard: catches the class of bug that typecheck and unit tests are
// structurally blind to, because nothing in either touches a real database.
//
// Three real incidents motivated this, all of which shipped green CI:
//
//   1. #99 and #102 both ran `create table if not exists
//      document_generation_jobs` with incompatible column sets. Whichever
//      migration applied first won; the other silently no-opped, leaving the
//      loser's code inserting into columns that did not exist. #102's index
//      also referenced a column only its own definition had, so the migration
//      itself errored out.
//   2. #120 and #129 did the same to `document_revisions`, sharing only three
//      of their columns.
//   3. Separately, eight tables the code writes to had migrations in the repo
//      that were never applied to the deployed database.
//
// (1) and (2) are repo-level defects and are what this module detects. (3) is
// deployment drift and needs a live connection, so it is reported by
// scripts/check-schema.mjs --applied rather than gated in CI.

export interface TableDefinition {
  table: string;
  file: string;
  columns: string[];
}

export interface SchemaCollision {
  table: string;
  files: string[];
  /** Columns that appear in some definitions but not all. */
  divergentColumns: string[];
  sharedColumns: string[];
}

/** A column the code selects that no migration defines. */
export interface UndefinedColumn {
  table: string;
  column: string;
  files: string[];
}

export interface SchemaGuardResult {
  collisions: SchemaCollision[];
  /** Tables the code queries that no migration creates. */
  undefinedTables: string[];
  definitions: TableDefinition[];
  undefinedColumns: UndefinedColumn[];
}

/**
 * Lines inside a `create table (...)` body that declare a constraint, not a column.
 *
 * Matched as keywords, not as prefixes. A plain `startsWith` treats a column
 * named `check_type` as a `check (...)` constraint and drops it — which is
 * exactly what happened to `document_qa_findings.check_type` and
 * `document_qa_check_runs.check_type`. A dropped column is worse than a noisy
 * one: collision detection compares column sets, so a column invisible in
 * *every* definition can diverge between two migrations without this guard ever
 * seeing it. The keyword must be followed by whitespace or an opening paren.
 */
const CONSTRAINT_KEYWORDS = [
  "primary key",
  "foreign key",
  "unique",
  "check",
  "constraint",
  "exclude",
  "like",
];

const CONSTRAINT_RE = new RegExp(`^(?:${CONSTRAINT_KEYWORDS.join("|")})(?:\\s|\\()`, "i");

/**
 * Remove `-- line` and block comments, leaving string literals intact.
 *
 * Quote tracking matters because this repo's SQL embeds `--` inside literals
 * (dashed separators in seeded prose), and blanking those would corrupt the
 * statement rather than just its comments.
 */
export function stripSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  let quote: "'" | '"' | null = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (quote) {
      out += ch;
      // '' and "" are escaped quotes inside a literal, not the end of one.
      if (ch === quote) {
        if (next === quote) {
          out += next;
          i += 2;
          continue;
        }
        quote = null;
      }
      i++;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch as "'" | '"';
      out += ch;
      i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue; // keep the newline itself
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Pull every `create table` definition out of one SQL file.
 *
 * Deliberately a light parser, not a full SQL grammar: it only needs the table
 * name and its column names, and it must never throw on the hand-written SQL in
 * this repo. Anything it cannot parse is skipped rather than guessed at.
 */
export function parseTableDefinitions(rawSql: string, file: string): TableDefinition[] {
  const out: TableDefinition[] = [];
  // Comments must go before anything splits on commas. A prose comment like
  // "-- queued: created, not yet picked up" contains a comma, and splitting
  // first would leave the fragment after it looking like a column named "not".
  const sql = stripSqlComments(rawSql);
  // `create table [if not exists] [public.]name (`
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?\s*\(/gi;

  for (let m = re.exec(sql); m; m = re.exec(sql)) {
    const table = m[1].toLowerCase();
    const bodyStart = m.index + m[0].length;

    // Walk to the matching close paren so nested parens (numeric(10,2),
    // check (... in (...))) do not end the body early.
    let depth = 1;
    let i = bodyStart;
    for (; i < sql.length && depth > 0; i++) {
      const ch = sql[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    if (depth !== 0) continue; // unbalanced — skip rather than mis-report
    const body = sql.slice(bodyStart, i - 1);

    // Split on top-level commas only.
    const parts: string[] = [];
    let buf = "";
    let d = 0;
    for (const ch of body) {
      if (ch === "(") d++;
      else if (ch === ")") d--;
      if (ch === "," && d === 0) {
        parts.push(buf);
        buf = "";
      } else buf += ch;
    }
    parts.push(buf);

    const columns: string[] = [];
    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;
      const lower = line.toLowerCase();
      if (CONSTRAINT_RE.test(lower)) continue;
      const name = line.split(/\s+/)[0].replace(/["']/g, "").toLowerCase();
      if (/^[a-z_][a-z0-9_]*$/.test(name)) columns.push(name);
    }
    out.push({ table, file, columns: [...new Set(columns)].sort() });
  }
  return out;
}

/**
 * Columns added after the fact, from `alter table ... add column`.
 *
 * Most columns in this schema arrive this way rather than in the original
 * `create table`, so the full column set for a table is its create-table body
 * plus every later add-column. One statement may add several columns at once
 * (`alter table t add column a ..., add column b ...;`), so this reads the whole
 * statement rather than the first clause.
 */
export function parseAddedColumns(rawSql: string): Array<{ table: string; column: string }> {
  const sql = stripSqlComments(rawSql);
  const out: Array<{ table: string; column: string }> = [];
  const statement = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?([\s\S]*?);/gi;

  for (let m = statement.exec(sql); m; m = statement.exec(sql)) {
    const table = m[1].toLowerCase();
    const add = /add\s+column\s+(?:if\s+not\s+exists\s+)?["']?([a-z_][a-z0-9_]*)["']?/gi;
    for (let a = add.exec(m[2]); a; a = add.exec(m[2])) {
      out.push({ table, column: a[1].toLowerCase() });
    }
  }
  return out;
}

/**
 * Columns the application selects, from `.from("t").select("a, b")` call sites.
 *
 * Only literal select lists are read. A `*`, an embedded resource (`documents(id)`),
 * or a non-literal argument is skipped rather than guessed at — this guard is
 * only worth having if a failure means something.
 */
export function parseCodeColumnReferences(source: string): Array<{ table: string; column: string }> {
  const flat = source.replace(/\s+/g, " ");
  const out: Array<{ table: string; column: string }> = [];
  const re = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)\s*\.select\(\s*["'`]([^"'`]*)["'`]/g;

  for (let m = re.exec(flat); m; m = re.exec(flat)) {
    const table = m[1].toLowerCase();
    const list = m[2];
    if (list.includes("*") || list.includes("(")) continue;
    for (const raw of list.split(",")) {
      let name = raw.trim();
      if (!name) continue;
      if (name.includes(":")) name = name.split(":").pop()!.trim();   // alias:column
      name = name.split("->")[0].trim();                              // json path
      if (/^[a-z_][a-z0-9_]*$/.test(name)) out.push({ table, column: name.toLowerCase() });
    }
  }
  return out;
}

/** Table names the application queries, from `.from("table")` call sites. */
export function parseCodeTableReferences(source: string): string[] {
  const out = new Set<string>();
  const re = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/g;
  for (let m = re.exec(source); m; m = re.exec(source)) out.add(m[1].toLowerCase());
  return [...out];
}

/**
 * A collision is two migrations creating the same table with different columns.
 *
 * Identical re-declarations are fine and common here — `schema.sql` and the
 * catch-up files intentionally restate tables so a fresh database can be built
 * in one pass. Only a *divergent* redefinition is a defect, because
 * `create table if not exists` makes the second one a silent no-op.
 */
export function findCollisions(definitions: TableDefinition[]): SchemaCollision[] {
  const byTable = new Map<string, TableDefinition[]>();
  for (const def of definitions) {
    const list = byTable.get(def.table) ?? [];
    list.push(def);
    byTable.set(def.table, list);
  }

  const collisions: SchemaCollision[] = [];
  for (const [table, defs] of byTable) {
    if (defs.length < 2) continue;
    const sets = defs.map((d) => new Set(d.columns));
    const shared = [...sets[0]].filter((c) => sets.every((s) => s.has(c)));
    const union = [...new Set(defs.flatMap((d) => d.columns))];
    const divergent = union.filter((c) => !sets.every((s) => s.has(c)));
    if (divergent.length === 0) continue; // identical restatement — fine
    collisions.push({
      table,
      files: defs.map((d) => d.file).sort(),
      divergentColumns: divergent.sort(),
      sharedColumns: shared.sort(),
    });
  }
  return collisions.sort((a, b) => a.table.localeCompare(b.table));
}

export function runSchemaGuard(
  migrations: Array<{ file: string; sql: string }>,
  codeSources: string[],
  options: { ignoreTables?: string[]; sourceNames?: string[] } = {},
): SchemaGuardResult {
  const ignore = new Set(options.ignoreTables ?? []);
  const definitions = migrations.flatMap((m) => parseTableDefinitions(m.sql, m.file));
  const defined = new Set(definitions.map((d) => d.table));

  const referenced = new Set<string>();
  for (const src of codeSources) for (const t of parseCodeTableReferences(src)) referenced.add(t);

  const undefinedTables = [...referenced]
    .filter((t) => !defined.has(t) && !ignore.has(t))
    .sort();

  // A table's real column set is its create-table body plus every add-column.
  const columnsByTable = new Map<string, Set<string>>();
  for (const def of definitions) {
    const set = columnsByTable.get(def.table) ?? new Set<string>();
    for (const c of def.columns) set.add(c);
    columnsByTable.set(def.table, set);
  }
  for (const m of migrations) {
    for (const { table, column } of parseAddedColumns(m.sql)) {
      columnsByTable.get(table)?.add(column);
    }
  }

  // Only tables the migrations define are checked; an undefined table is already
  // reported above and would otherwise be reported once more per column.
  const missing = new Map<string, UndefinedColumn>();
  for (const { source, file } of codeSources.map((source, i) => ({ source, file: options.sourceNames?.[i] ?? `source[${i}]` }))) {
    for (const { table, column } of parseCodeColumnReferences(source)) {
      if (ignore.has(table)) continue;
      const known = columnsByTable.get(table);
      if (!known || known.has(column)) continue;
      const key = `${table}.${column}`;
      const entry = missing.get(key) ?? { table, column, files: [] };
      if (!entry.files.includes(file)) entry.files.push(file);
      missing.set(key, entry);
    }
  }
  const undefinedColumns = [...missing.values()].sort((a, b) =>
    `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));

  return { collisions: findCollisions(definitions), undefinedTables, definitions, undefinedColumns };
}

export function formatSchemaGuardReport(result: SchemaGuardResult): string {
  const lines: string[] = [];
  if (
    result.collisions.length === 0 &&
    result.undefinedTables.length === 0 &&
    result.undefinedColumns.length === 0
  ) {
    lines.push(`Schema guard: OK — ${result.definitions.length} table definitions checked.`);
    return lines.join("\n");
  }

  for (const c of result.collisions) {
    lines.push(`COLLISION  ${c.table}`);
    lines.push(`  defined in: ${c.files.join(", ")}`);
    lines.push(`  shared columns:    ${c.sharedColumns.join(", ") || "(none)"}`);
    lines.push(`  divergent columns: ${c.divergentColumns.join(", ")}`);
    lines.push(
      "  Both use `create table if not exists`, so whichever migration applies first wins",
    );
    lines.push(
      "  and the other silently does nothing — leaving its code writing to columns that",
    );
    lines.push("  do not exist. Reconcile the two definitions or rename one table.");
    lines.push("");
  }

  if (result.undefinedTables.length > 0) {
    lines.push("UNDEFINED TABLES (queried by code, created by no migration)");
    for (const t of result.undefinedTables) lines.push(`  ${t}`);
    lines.push("");
  }

  if (result.undefinedColumns.length > 0) {
    lines.push("UNDEFINED COLUMNS (selected by code, defined by no migration)");
    for (const c of result.undefinedColumns) {
      lines.push(`  ${c.table}.${c.column}`);
      for (const f of c.files) lines.push(`    ${f}`);
    }
    lines.push(
      "  PostgREST rejects the whole select, so the query returns an error and no",
    );
    lines.push(
      "  rows. Code that ignores the error reads this as 'nothing found' and carries",
    );
    lines.push("  on with empty data — silently, and only at runtime.");
    lines.push("");
  }
  return lines.join("\n");
}
