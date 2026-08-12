import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Integration test for the wizard draft route handler (app/api/wizard/route.ts).
//
// Task #26 unit-tested the extracted decision logic (resolveWizardDocumentTarget,
// isCompleteFileUpdate, starter-answer merge/drain). THIS file exercises the
// route's own wiring against mocked Anthropic + Supabase clients, locking in the
// "draft appears but nothing happens" regressions the hardening was meant to
// prevent:
//   • an "update" target issues a status-PRESERVING UPDATE (never knocks
//     pending_review back to "draft");
//   • a "pre_warmed" suggestion IS promoted to "draft" on first real draft;
//   • the insert path persists a brand-new document and returns its id;
//   • a failed persistence returns HTTP 500 with the draft text (never a silent
//     200 + documentId:null that strands the client);
//   • a truncated response sets the truncated flag, records it in content_json,
//     and skips the Living-File parser so a half-written block can't corrupt it.
//
// The route imports everything via the `@/lib` alias; lib/test-support/alias-loader.mjs
// (registered in the `test` script) resolves it, and module mocks below replace
// the external/IO modules so we can drive each branch deterministically.

const ROOT = process.cwd();
const libUrl = (name: string) => pathToFileURL(path.join(ROOT, "lib", name)).href;

// ── Shared, per-test mutable state read by the module mocks ───────────────────
type AnthropicMessage = {
  content: Array<{ type: string; text?: string }>;
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
};

let anthropicMessage: AnthropicMessage;
let anthropicThrows: Error | null;
let target: unknown;
let extractedDraft: string | null | undefined;
let isComplete: boolean;
let dbConfig: DbConfig;
let recorder: DbCall[];

const parseSpy = mock.fn(async () => {});
const syncSpy = mock.fn(async () => {});

// ── Configurable Supabase mock ────────────────────────────────────────────────
interface DbCall {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  cols: string | null;
  filters: Array<[string, unknown]>;
  payload: unknown;
  kind: "single" | "maybeSingle" | "list";
}

type TableHandler = {
  single?: () => { data: unknown; error?: unknown };
  list?: () => { data: unknown; error?: unknown };
  insert?: (state: DbCall) => { data: unknown; error?: unknown };
  update?: (state: DbCall) => { error?: unknown };
  delete?: (state: DbCall) => { error?: unknown };
};
type DbConfig = Record<string, TableHandler>;

function makeDb(config: DbConfig, calls: DbCall[]) {
  function from(table: string) {
    const state: DbCall = {
      table,
      op: "select",
      cols: null,
      filters: [],
      payload: null,
      kind: "list",
    };
    const builder: Record<string, unknown> = {};
    builder.select = (cols: string) => {
      state.cols = cols;
      return builder;
    };
    builder.insert = (payload: unknown) => {
      state.op = "insert";
      state.payload = payload;
      return builder;
    };
    builder.update = (payload: unknown) => {
      state.op = "update";
      state.payload = payload;
      return builder;
    };
    builder.delete = () => {
      state.op = "delete";
      return builder;
    };
    builder.eq = (col: string, val: unknown) => {
      state.filters.push([col, val]);
      return builder;
    };
    builder.in = () => builder;
    builder.is = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;

    function finalize(kind: DbCall["kind"]) {
      state.kind = kind;
      calls.push({ ...state });
      const handler = config[table] ?? {};
      if (state.op === "insert") return handler.insert?.(state) ?? { data: null, error: null };
      if (state.op === "update") return handler.update?.(state) ?? { error: null };
      if (state.op === "delete") return handler.delete?.(state) ?? { error: null };
      if (kind === "single" || kind === "maybeSingle") {
        return handler.single?.() ?? { data: null, error: null };
      }
      return handler.list?.() ?? { data: [], error: null };
    }

    builder.single = async () => finalize("single");
    builder.maybeSingle = async () => finalize("maybeSingle");
    // Supabase query builders are thenable — awaiting one without single() yields
    // the full result set. Mirror that so the route's list reads + the
    // status-preserving UPDATE (which awaits the builder directly) resolve.
    builder.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(finalize("list")).then(onF, onR);
    return builder;
  }
  return { from } as unknown;
}

// Default config: case loads succeed, lists are empty.
function baseConfig(extra: DbConfig = {}): DbConfig {
  return {
    case_files: { single: () => ({ data: { id: "case-1" }, error: null }) },
    fact_items: { list: () => ({ data: [], error: null }) },
    attachments: { list: () => ({ data: [], error: null }) },
    requested_attachments: { list: () => ({ data: [], error: null }) },
    ...extra,
  };
}

// ── Module mocks (must be registered before importing the route) ──────────────
class MockAnthropic {
  messages = {
    stream: () => ({
      finalMessage: async () => {
        if (anthropicThrows) throw anthropicThrows;
        return anthropicMessage;
      },
    }),
  };
  constructor(_opts: unknown) {}
}

// next/server is mapped to a local stub by the alias loader (it doesn't resolve
// under plain `node --test`), so it needs no module mock here.
mock.module("@anthropic-ai/sdk", { defaultExport: MockAnthropic });
mock.module(libUrl("supabase/server.ts"), {
  namedExports: {
    createClient: async () => makeDb(dbConfig, recorder),
    createServiceClient: () => makeDb(dbConfig, recorder),
  },
});
mock.module(libUrl("prompts.ts"), {
  namedExports: {
    buildDrafterSystemPrompt: () => "SYS",
    WIZARD_FIELD_HINTS: new Proxy({}, { get: () => "hints" }),
    wizardFieldGuidance: () => "hints",
    buildFileContext: () => "ctx",
  },
});
mock.module(libUrl("file-parser.ts"), {
  namedExports: {
    extractDraftText: () => extractedDraft,
    isCompleteFileUpdate: () => isComplete,
    parseAndUpdateFile: parseSpy,
    syncDraftGapsToLivingFile: syncSpy,
  },
});
mock.module(libUrl("document-utils.ts"), {
  namedExports: {
    resolveWizardDocumentTarget: async () => target,
    // The wizard route also stamps facts-synced after a successful save; mocking
    // it as a no-op keeps this test focused on draft persistence. Module mocks
    // replace the whole module, so every export the route imports must be listed.
    stampFactsSynced: async () => {},
  },
});
mock.module(libUrl("usage-tracker.ts"), {
  namedExports: { recordAiFromMessage: async () => {} },
});
mock.module(libUrl("truncation-logger.ts"), {
  namedExports: { logTruncation: () => {} },
});

// BYPASS_AUTH short-circuits the auth/subscription/ownership checks so the test
// focuses on the draft-persistence wiring (auth is covered elsewhere). It must
// be set before the route module is first evaluated.
process.env.BYPASS_AUTH = "true";
process.env.Claude_Instant_Attorney = "test-key";

const { POST } = await import(pathToFileURL(path.join(ROOT, "app/api/wizard/route.ts")).href);

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const validBody = (over: Record<string, unknown> = {}) => ({
  messages: [{ role: "user", content: "draft my demand letter" }],
  caseFileId: "case-1",
  wizardType: "demand_letter",
  ...over,
});

function okMessage(over: Partial<AnthropicMessage> = {}): AnthropicMessage {
  return {
    content: [{ type: "text", text: "FULL RESPONSE BODY" }],
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 200 },
    ...over,
  };
}

beforeEach(() => {
  anthropicMessage = okMessage();
  anthropicThrows = null;
  target = { action: "insert" };
  extractedDraft = "DRAFT-TEXT";
  isComplete = false;
  recorder = [];
  dbConfig = baseConfig();
  parseSpy.mock.resetCalls();
  syncSpy.mock.resetCalls();
});

function lastDocCall(op: DbCall["op"]) {
  return [...recorder].reverse().find((c) => c.table === "documents" && c.op === op);
}

/**
 * The update carrying the generated content, as distinct from the bookkeeping
 * updates that follow it. Since #118 the revision boundary writes
 * living_file_sync_status to `documents` after the content write, so "the last
 * UPDATE" is no longer the one under test.
 */
function lastContentUpdate() {
  return [...recorder].reverse().find((c) =>
    c.table === "documents" && c.op === "update" &&
    Object.prototype.hasOwnProperty.call(c.payload as object, "draft_text"));
}

// ── 1. Update target preserves an elevated lifecycle status ───────────────────
test("update target preserves pending_review status (never knocks it back to draft)", async () => {
  target = {
    action: "update",
    documentId: "doc-1",
    existing: { status: "pending_review", content_json: { a: 1 } },
  };
  dbConfig = baseConfig({ documents: { update: () => ({ error: null }) } });

  const res = await POST(makeReq(validBody()));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.documentId, "doc-1");

  const upd = lastContentUpdate();
  assert.ok(upd, "expected a documents UPDATE");
  const payload = upd!.payload as Record<string, unknown>;
  assert.equal(payload.status, "pending_review", "must preserve pending_review");
  assert.equal(payload.draft_text, "DRAFT-TEXT");
  // The update is scoped to the owner (user_id) so an attacker can't redirect it.
  assert.ok(
    upd!.filters.some(([c]) => c === "id") && upd!.filters.some(([c]) => c === "user_id"),
    "update must be scoped by id + user_id"
  );
});

test("update target promotes a pre_warmed suggestion to draft", async () => {
  target = {
    action: "update",
    documentId: "doc-pw",
    existing: { status: "pre_warmed", content_json: {} },
  };
  dbConfig = baseConfig({ documents: { update: () => ({ error: null }) } });

  const res = await POST(makeReq(validBody()));
  assert.equal(res.status, 200);
  const payload = lastContentUpdate()!.payload as Record<string, unknown>;
  assert.equal(payload.status, "draft", "pre_warmed should be promoted to draft");
});

// ── 2. Insert path persists a new document and returns its id ─────────────────
test("insert target creates a new draft document and returns its id", async () => {
  target = { action: "insert" };
  dbConfig = baseConfig({
    documents: { insert: () => ({ data: { id: "new-doc" }, error: null }) },
  });

  const res = await POST(makeReq(validBody()));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.documentId, "new-doc");
  assert.equal(body.truncated, false);

  const ins = lastDocCall("insert");
  assert.ok(ins, "expected a documents INSERT");
  const payload = ins!.payload as Record<string, unknown>;
  assert.equal(payload.status, "draft");
  assert.equal(payload.doc_type, "demand_letter");
  assert.equal(payload.draft_text, "DRAFT-TEXT");
  assert.equal(payload.case_file_id, "case-1");
});

// ── 3. 500 strand-guard when persistence fails ────────────────────────────────
test("insert failure returns HTTP 500 with the draft text (never a silent 200 + null id)", async () => {
  target = { action: "insert" };
  dbConfig = baseConfig({
    documents: { insert: () => ({ data: null, error: { message: "RLS denied" } }) },
  });

  const res = await POST(makeReq(validBody()));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.ok(body.error, "error message must be present");
  assert.equal(body.text, "FULL RESPONSE BODY", "draft text must be returned so no work is lost");
  assert.equal(body.documentId, undefined);
});

test("update failure returns HTTP 500 (no stranded draft)", async () => {
  target = {
    action: "update",
    documentId: "doc-x",
    existing: { status: "draft", content_json: {} },
  };
  dbConfig = baseConfig({
    documents: { update: () => ({ error: { message: "write blocked" } }) },
  });

  const res = await POST(makeReq(validBody()));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.text, "FULL RESPONSE BODY");
});

// ── 4. Truncated response sets the flag and skips the file parser ──────────────
test("truncated response sets truncated flag, records it, and skips the Living-File parser", async () => {
  anthropicMessage = okMessage({ stop_reason: "max_tokens" });
  extractedDraft = null;
  // A truncated response leaves an incomplete FILE UPDATE block (no closing
  // marker), so isCompleteFileUpdate is false → parser must be skipped.
  isComplete = false;
  target = { action: "insert" };
  let insertedPayload: Record<string, unknown> | null = null;
  dbConfig = baseConfig({
    documents: {
      insert: (state) => {
        insertedPayload = state.payload as Record<string, unknown>;
        return { data: { id: "trunc-doc" }, error: null };
      },
    },
  });

  const res = await POST(makeReq(validBody()));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.truncated, true, "response must flag truncation");
  assert.equal(body.documentId, "trunc-doc");

  const cj = insertedPayload!.content_json as Record<string, unknown>;
  assert.equal(cj.truncated, true, "truncation must be recorded in content_json");
  assert.equal(cj.generation_state, "generation_incomplete");
  assert.equal(insertedPayload!.draft_text, null, "raw recovery output must not become draft_text");

  assert.equal(parseSpy.mock.callCount(), 0, "file parser must NOT run on a truncated/incomplete block");
});

test("missing draft markers are saved only as recovery content", async () => {
  anthropicMessage = okMessage({ content: [{ type: "text", text: "useful but markerless recovery text" }] });
  extractedDraft = null;
  dbConfig = baseConfig({ documents: { insert: () => ({ data: { id: "recovery-doc" }, error: null }) } });

  const res = await POST(makeReq(validBody()));
  const body = await res.json();
  const payload = lastDocCall("insert")!.payload as Record<string, unknown>;
  const cj = payload.content_json as Record<string, unknown>;
  assert.equal(body.generationIncomplete, true);
  assert.equal(payload.draft_text, null);
  assert.equal(cj.raw_generation_response, "useful but markerless recovery text");
  assert.equal(cj.generation_incomplete_reason, "missing_draft_block");
});

test("truncation before the end marker never creates renderable draft text", async () => {
  anthropicMessage = okMessage({
    content: [{ type: "text", text: "---DRAFT READY---\nunfinished pleading" }],
    stop_reason: "max_tokens",
  });
  extractedDraft = null;
  dbConfig = baseConfig({ documents: { insert: () => ({ data: { id: "partial-doc" }, error: null }) } });

  await POST(makeReq(validBody()));
  const payload = lastDocCall("insert")!.payload as Record<string, unknown>;
  const cj = payload.content_json as Record<string, unknown>;
  assert.equal(payload.draft_text, null);
  assert.equal(cj.generation_incomplete_reason, "truncated_draft_block");
});

test("complete draft followed by truncated metadata remains renderable", async () => {
  anthropicMessage = okMessage({
    content: [{ type: "text", text: "---DRAFT READY---\nComplete draft\n---END DRAFT---\n---FILE UPDATE---\n{" }],
    stop_reason: "max_tokens",
  });
  extractedDraft = "Complete draft";
  dbConfig = baseConfig({ documents: { insert: () => ({ data: { id: "complete-doc" }, error: null }) } });

  const res = await POST(makeReq(validBody()));
  const body = await res.json();
  const payload = lastDocCall("insert")!.payload as Record<string, unknown>;
  assert.equal(body.generationIncomplete, false);
  assert.equal(payload.draft_text, "Complete draft");
  assert.equal((payload.content_json as Record<string, unknown>).generation_state, "complete");
});

test("successful retry promotes a complete block and clears incomplete state", async () => {
  target = {
    action: "update",
    documentId: "recovery-doc",
    existing: { status: "draft", content_json: { generation_incomplete: true, raw_generation_response: "partial" } },
  };
  extractedDraft = "Regenerated complete draft";
  anthropicMessage = okMessage({ content: [{ type: "text", text: "---DRAFT READY---\nRegenerated complete draft\n---END DRAFT---" }] });
  dbConfig = baseConfig({ documents: { update: () => ({ error: null }) } });

  const res = await POST(makeReq(validBody({ documentId: "recovery-doc" })));
  const body = await res.json();
  const payload = lastContentUpdate()!.payload as Record<string, unknown>;
  assert.equal(body.generationIncomplete, false);
  assert.equal(payload.draft_text, "Regenerated complete draft");
  assert.equal((payload.content_json as Record<string, unknown>).generation_incomplete, false);
  assert.equal((payload.content_json as Record<string, unknown>).generation_state, "complete");
});

test("a complete FILE UPDATE block runs the Living-File parser", async () => {
  isComplete = true;
  target = { action: "insert" };
  dbConfig = baseConfig({
    documents: { insert: () => ({ data: { id: "doc-ok" }, error: null }) },
  });

  const res = await POST(makeReq(validBody()));
  assert.equal(res.status, 200);
  assert.equal(parseSpy.mock.callCount(), 1, "file parser SHOULD run when the block is complete");
});

// ── 5. Anthropic failure surfaces a friendly 502 ──────────────────────────────
test("an Anthropic streaming error returns a friendly 502 (no raw SDK leak)", async () => {
  anthropicThrows = new Error("upstream exploded: secret-token");
  const res = await POST(makeReq(validBody()));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.ok(body.error);
  assert.ok(!/secret-token/.test(body.error), "must not leak raw SDK error to the client");
});

// ── 6. Basic request validation still rejects bad input ───────────────────────
test("invalid wizard type is rejected with 400", async () => {
  const res = await POST(makeReq(validBody({ wizardType: "not_a_wizard" })));
  assert.equal(res.status, 400);
});

test("missing caseFileId is rejected with 400", async () => {
  const res = await POST(makeReq(validBody({ caseFileId: undefined })));
  assert.equal(res.status, 400);
});
