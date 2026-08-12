import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { newMatterColumns, resolveMatter } from "./matter-routing.ts";

// ── The guard ──────────────────────────────────────────────────────────────
//
// `chat-acp` used to answer "which matter is this turn about?" by taking the
// client's most recently opened file. A client with an open will matter who
// pressed the dashboard's own "Start another case" button was attached to the
// will instead, and everything they said about the new problem was extracted
// into the wrong Living File. Nothing failed; it just landed in the wrong place.
//
// The signature of that bug is ordering `case_files` by `opened_at` and taking
// one row. Listing matters for a switcher or a dashboard grid orders the same
// way but takes all of them, so the pair `order("opened_at") + limit(1)` is what
// separates "show me the matters" from "silently pick one to work in".
//
// If this test fails, you are choosing a matter by recency. Take the id from the
// caller, or open a new matter with resolveMatter. Do not add a file to an
// allowlist to make it pass.

const SEARCH_ROOTS = ["app", "lib", "components"];

/**
 * Drop comments before scanning, so the guard tests code rather than prose.
 *
 * Without this it fails on matter-routing.ts itself, which quotes the offending
 * query in its own header to explain what it replaced — and on any future
 * comment that documents the rule. Explaining the bug must not read as
 * committing it.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      found.push(...(await sourceFiles(path)));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

test("no file picks a working matter by recency", async () => {
  const offenders: string[] = [];

  for (const root of SEARCH_ROOTS) {
    for (const path of await sourceFiles(root)) {
      const src = await readFile(path, "utf8");
      if (!src.includes("case_files")) continue;

      // Collapse whitespace so a chained query split across lines reads as one
      // string — the real offender was spread over four lines.
      const flat = stripComments(src).replace(/\s+/g, " ");
      if (/order\(\s*"opened_at"[^)]*\)[^;]{0,200}?limit\(\s*1\s*\)/.test(flat)) {
        offenders.push(path);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `These files select a single case_file by recency. A client with more than one ` +
      `matter will have work land in the wrong one. Route through resolveMatter ` +
      `(lib/matter-routing.ts) instead:\n  ${offenders.join("\n  ")}`
  );
});

// ── resolveMatter ──────────────────────────────────────────────────────────

/** Minimal Supabase query-builder stub: records calls, returns canned rows. */
function stubDb(handlers: {
  select?: (id: string) => { id: string; user_id: string } | null;
  insert?: (columns: Record<string, unknown>) => { id: string } | null;
}) {
  const calls = { selected: [] as string[], inserted: [] as Record<string, unknown>[] };

  const db = {
    from(table: string) {
      assert.equal(table, "case_files");
      return {
        select() {
          return {
            eq(_col: string, id: string) {
              calls.selected.push(id);
              return { maybeSingle: async () => ({ data: handlers.select?.(id) ?? null }) };
            },
          };
        },
        insert(columns: Record<string, unknown>) {
          calls.inserted.push(columns);
          const row = handlers.insert?.(columns) ?? null;
          return {
            select: () => ({
              single: async () => ({ data: row, error: row ? null : new Error("insert failed") }),
            }),
          };
        },
      };
    },
  };

  return { db, calls };
}

test("an explicit matter the client owns is used, and nothing is opened", async () => {
  const { db, calls } = stubDb({ select: (id) => ({ id, user_id: "user-1" }) });

  const routed = await resolveMatter(db, "user-1", { caseFileId: "matter-a" });

  assert.deepEqual(routed, { ok: true, caseFileId: "matter-a", opened: false });
  assert.deepEqual(calls.inserted, [], "resolving an existing matter must not open one");
});

test("another client's matter is refused, not silently replaced", async () => {
  const { db, calls } = stubDb({ select: (id) => ({ id, user_id: "someone-else" }) });

  const routed = await resolveMatter(db, "user-1", { caseFileId: "matter-a" });

  assert.equal(routed.ok, false);
  assert.equal(routed.ok === false && routed.status, 403);
  // The dangerous failure is opening a fresh matter and carrying on as if the
  // request were fine, which hides the authorization problem behind new data.
  assert.deepEqual(calls.inserted, [], "a refused matter must not open a replacement");
});

test("a matter id that does not exist is a 404", async () => {
  const { db } = stubDb({ select: () => null });

  const routed = await resolveMatter(db, "user-1", { caseFileId: "gone" });

  assert.equal(routed.ok === false && routed.status, 404);
});

test("no matter id opens a new matter rather than reaching for an existing one", async () => {
  const { db, calls } = stubDb({ insert: () => ({ id: "matter-new" }) });

  const routed = await resolveMatter(db, "user-1", { homeState: "TX" });

  assert.deepEqual(routed, { ok: true, caseFileId: "matter-new", opened: true });
  assert.deepEqual(calls.selected, [], "opening a matter must not read the client's other files");
  assert.equal(calls.inserted[0].user_id, "user-1");
});

test("a failed insert reports failure instead of returning an unusable id", async () => {
  const { db } = stubDb({ insert: () => null });

  const routed = await resolveMatter(db, "user-1", {});

  assert.equal(routed.ok === false && routed.status, 500);
});

// ── newMatterColumns ───────────────────────────────────────────────────────

test("a home state seeds the forum, and 'OTHER' is not a state", () => {
  assert.equal(newMatterColumns("u", { homeState: "TX" }).jurisdiction, "Texas");
  assert.equal(
    newMatterColumns("u", { homeState: "OTHER" }).jurisdiction,
    "Outside the United States"
  );
});

test("an unknown home state seeds nothing — the risk gate must see the gap", () => {
  // Never default a jurisdiction. A high-risk instrument blocks on an unknown
  // forum, and it can only do that if the column is genuinely empty.
  assert.equal("jurisdiction" in newMatterColumns("u", { homeState: null }), false);
  assert.equal("jurisdiction" in newMatterColumns("u", {}), false);
});

test("a quick consult self-archives; a standard matter does not", () => {
  const quick = newMatterColumns("u", { fileType: "quick_consult" });
  assert.equal(quick.file_type, "quick_consult");
  assert.ok(new Date(quick.archive_at as string).getTime() > Date.now());

  const standard = newMatterColumns("u", { fileType: "standard" });
  assert.equal("archive_at" in standard, false);
});
