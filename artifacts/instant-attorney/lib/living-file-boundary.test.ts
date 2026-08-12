import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cursorAfter } from "./message-cursor.ts";

const route = readFileSync(new URL("../app/api/chat-acp/route.ts", import.meta.url), "utf8");
const extractor = readFileSync(new URL("./living-file-extractor.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/schema-stage47-message-boundary-sync.sql", import.meta.url), "utf8");

test("stable cursor orders equal-timestamp concurrent inserts by id", () => {
  const a = { createdAt: "2026-01-01T00:00:00Z", id: "00000000-0000-0000-0000-000000000001" };
  const b = { createdAt: a.createdAt, id: "00000000-0000-0000-0000-000000000002" };
  assert.equal(cursorAfter(b, a), true);
  assert.equal(cursorAfter(a, b), false);
});

test("turn A inline completion is bounded by its persisted user message, leaving B eligible", () => {
  assert.match(route, /select\("id, created_at"\)/);
  assert.match(route, /markLivingFileSyncedThrough\(db, resolvedCaseFileId, userMessageCursor\)/);
  assert.match(route, /\{ through: userMessageCursor \}/);
  assert.doesNotMatch(route, /last_file_synced_at: new Date\(\)\.toISOString\(\)/);
  assert.match(extractor, /created_at\.eq\.\$\{opts\.through\.createdAt\},id\.lte\.\$\{opts\.through\.id\}/);
});

test("simultaneous forced syncs use one durable per-case lease", () => {
  assert.match(migration, /case_file_id uuid primary key/);
  assert.match(migration, /where living_file_sync_jobs\.locked_until is null or living_file_sync_jobs\.locked_until < now\(\)/);
  assert.match(extractor, /reason: "busy"/);
});

test("failed and malformed model results release the lease without advancing", () => {
  const failure = extractor.indexOf("model call failed");
  const malformed = extractor.indexOf("incomplete LIVING FILE block");
  assert.match(extractor.slice(failure, malformed), /return fail\(/);
  assert.match(extractor.slice(malformed), /return fail\(/);
  assert.match(migration, /last_file_synced_at is not distinct from p_expected_created_at/);
});
