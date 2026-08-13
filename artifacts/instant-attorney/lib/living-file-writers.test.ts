import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

/**
 * Cheap Living File writer-set guard.
 *
 * Event-sourcing every semantic `case_files` write is the right long-term shape
 * and the wrong next move (see CONSOLIDATION.md). What this pins is the writer
 * *set*: a new file that mutates `case_files` has to be named here, with a
 * reason, the same way `document-persistence.test.ts` names document writers.
 *
 * Administrative writes (title, archive, legal hold, opening a matter) are
 * listed, not forbidden. Semantic writes (jurisdiction, strategy, Living File
 * fields) are listed so they stay visible. Adding a writer by accident — the
 * failure mode — is what fails the suite.
 */

const ROOT = new URL("../", import.meta.url);

const MUTATION = /from\(\s*"case_files"\s*\)(?:(?!from\().){0,250}?\.(update|insert|upsert|delete)\(/;

/**
 * Every production file that mutates `case_files`. A blank reason is not
 * allowed; the point of the map is that the next agent can read why the write
 * exists without rediscovering it.
 */
const caseFileWriters: Record<string, string> = {
  "lib/file-parser.ts":
    "semantic — applies ---LIVING FILE--- / ---LEGAL STRATEGY--- blocks",
  "lib/existing-counsel-persist.ts":
    "semantic — counsel intake fields the client confirmed",
  "lib/consult-wrap-up.ts":
    "semantic — attorney wrap-up lands on the file",
  "lib/strength-check-store.ts":
    "semantic — strength check into legal_strategy",
  "lib/pre-consult-generate.ts":
    "semantic — pre-consult memo",
  "lib/title-generator.ts":
    "administrative — generates the matter title",
  "lib/matter-routing.ts":
    "administrative — opens a new matter; never patches an existing one by recency",
  "lib/orchestrator-tools.ts":
    "administrative — open_new_matter inserts a new case_files row after confirmation",
  "lib/archive/matter-archive.ts":
    "administrative — archive / restore / destroy",
  "app/api/chat-acp/route.ts":
    "semantic — seeds jurisdiction from home_state when the file has none",
  "app/api/chat-acp/organize/route.ts":
    "administrative — session recap for the next visit",
  "app/api/case-files/[id]/archive/route.ts":
    "administrative — client archive",
  "app/api/case-files/[id]/restore/route.ts":
    "administrative — client restore",
  "app/api/case-files/[id]/merge/route.ts":
    "administrative — merge or promote a quick consult",
  "app/api/admin/archives/hold/route.ts":
    "administrative — legal hold",
  "app/api/attorney/client-files/route.ts":
    "administrative — attorney-originated matter for their own client",
  "app/api/attorney/case-files/[id]/document-plan/route.ts":
    "semantic — attorney edits recommended instruments on legal_strategy",
  "app/api/financials/context/route.ts":
    "semantic — financial disclosure ack and representation scope",
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

async function sourceFilesUnder(dir: URL): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) found.push(...(await sourceFilesUnder(child)));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(child.pathname);
  }
  return found;
}

test("every case_files mutation is a named writer", async () => {
  const found: string[] = [];
  const rootPath = ROOT.pathname;
  const files = [
    ...(await sourceFilesUnder(new URL("app/", ROOT))),
    ...(await sourceFilesUnder(new URL("lib/", ROOT))),
  ];

  for (const path of files) {
    const src = await readFile(path, "utf8");
    if (!src.includes("case_files")) continue;
    const flat = stripComments(src).replace(/\s+/g, " ");
    if (MUTATION.test(flat)) found.push(decodeURIComponent(path.slice(rootPath.length)));
  }

  found.sort();
  const unexpected = found.filter((path) => !(path in caseFileWriters));
  const missing = Object.keys(caseFileWriters).filter((path) => !found.includes(path)).sort();

  assert.deepEqual(
    unexpected,
    [],
    `These files mutate case_files but are not in caseFileWriters. If the write is ` +
      `administrative (title, archive, legal hold, opening a matter), add it with ` +
      `that reason. If it is semantic (jurisdiction, strategy, Living File fields), ` +
      `add it too — visibility is the point. Do not event-source to make this pass:\n  ` +
      unexpected.join("\n  "),
  );
  assert.deepEqual(
    missing,
    [],
    `caseFileWriters lists files that no longer mutate case_files. Remove the stale ` +
      `entries:\n  ${missing.join("\n  ")}`,
  );
});
