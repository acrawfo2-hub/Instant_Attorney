// Schema guard runner.
//
//   node scripts/check-schema.mjs             # report to stdout
//   node scripts/check-schema.mjs --strict    # exit 1 on any finding (CI)
//   node scripts/check-schema.mjs --applied   # also diff against the live database
//
// Default mode reads only the repo, so it runs in CI with no database and no
// credentials. It answers two questions:
//
//   * Do two migrations create the same table with different columns? Both use
//     `create table if not exists`, so the second silently does nothing and its
//     code ends up writing to columns that were never created.
//   * Does the code query a table no migration creates?
//
// --applied additionally compares the deployed schema against the migrations,
// which is how you catch migrations that were written and merged but never run.
// It needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and is
// deliberately NOT part of the CI gate — CI has no business holding production
// credentials, and drift is an operational fact rather than a code defect.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { runSchemaGuard, formatSchemaGuardReport } from "../lib/schema-guard.ts";

const ROOT = join(import.meta.dirname, "..");
const strict = process.argv.includes("--strict");
const checkApplied = process.argv.includes("--applied");

// Relations reached through .from() that no migration creates on purpose —
// views, or tables owned by another schema. Keep this list short and explain
// every entry; it is the one place a real finding can be silenced.
const IGNORE_TABLES = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const migrations = readdirSync(join(ROOT, "supabase"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ file: f, sql: readFileSync(join(ROOT, "supabase", f), "utf8") }));

// The guard's own module documents the `.from("table")` pattern it scans for,
// so scanning it finds a table literally named "table". Excluded rather than
// reworded, so the doc comment stays readable.
const SELF = join(ROOT, "lib", "schema-guard.ts");

const codeFiles = ["app", "lib", "components"]
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== SELF);

const result = runSchemaGuard(
  migrations,
  codeFiles.map((f) => readFileSync(f, "utf8")),
  { ignoreTables: IGNORE_TABLES },
);

console.log(
  `Schema guard: ${migrations.length} migration files, ${codeFiles.length} source files.`,
);
console.log(formatSchemaGuardReport(result));

let failed = result.collisions.length > 0 || result.undefinedTables.length > 0;

if (checkApplied) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "--applied needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(2);
  }
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/schema_guard_tables`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => null);

  if (!res || !res.ok) {
    console.error(
      "\nCould not read the deployed table list. Create this helper once:\n" +
        "  create or replace function public.schema_guard_tables()\n" +
        "  returns setof text language sql security definer set search_path = public, pg_temp as $$\n" +
        "    select table_name::text from information_schema.tables\n" +
        "    where table_schema = 'public' and table_type = 'BASE TABLE';\n" +
        "  $$;\n" +
        "  revoke execute on function public.schema_guard_tables() from anon, authenticated;",
    );
    process.exit(2);
  }

  const live = new Set(await res.json());
  const defined = [...new Set(result.definitions.map((d) => d.table))];
  const missing = defined.filter((t) => !live.has(t)).sort();

  console.log("\n── Deployment drift ──────────────────────────────────────────");
  if (missing.length === 0) {
    console.log("Every table the migrations define exists in the deployed database.");
  } else {
    console.log(
      `${missing.length} table(s) defined by migrations are MISSING from the deployed database:`,
    );
    for (const t of missing) console.log(`  ${t}`);
    console.log(
      "\nThe migrations exist in the repo but were never applied. Any feature\n" +
        "writing to these tables fails at runtime while typecheck, lint and the\n" +
        "unit tests all stay green.",
    );
    failed = true;
  }
}

if (failed && strict) {
  console.error("\nSchema guard failed.");
  process.exit(1);
}
