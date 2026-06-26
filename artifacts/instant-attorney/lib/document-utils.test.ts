import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveWizardDocumentTarget } from "./document-utils.ts";

// These tests lock in the wizard route's document-selection precedence so a fresh
// generation can never silently insert a duplicate primary document or overwrite
// another user's document (IDOR). resolveWizardDocumentTarget runs up to three
// reads against the `documents` table; the mock below routes each one by the
// column list it selects:
//   • "id"                                  → findReusableDocument
//   • "status, content_json"                → the per-id ownership check
//   • "id, status, content_json, draft_text"→ findPrimaryDocument

type PrimaryRow = {
  id: string;
  status: string | null;
  content_json: unknown;
  draft_text: string | null;
};

interface DbHandlers {
  // Reusable in-progress primary draft (only consulted when no id is supplied).
  reusable?: { id: string } | null;
  // Ownership check result for whichever candidate id is in play.
  ownership?: { status: string | null; content_json: unknown } | null;
  // Latest primary document of this type, any status.
  primary?: PrimaryRow | null;
}

function makeQueryBuilder(data: unknown) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order", "limit"]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = async () => ({ data });
  builder.single = async () => ({ data });
  return builder;
}

function makeDb(handlers: DbHandlers): SupabaseClient {
  return {
    from() {
      return {
        select(cols: string) {
          let data: unknown = null;
          if (cols === "id") data = handlers.reusable ?? null;
          else if (cols === "status, content_json") data = handlers.ownership ?? null;
          else if (cols.includes("draft_text")) data = handlers.primary ?? null;
          return makeQueryBuilder(data);
        },
      };
    },
  } as unknown as SupabaseClient;
}

const params = (suppliedDocumentId?: string) => ({
  caseFileId: "case-1",
  wizardType: "demand_letter",
  userId: "user-1",
  suppliedDocumentId,
});

// ── 1. Caller-supplied id (owned) takes precedence ───────────────────────────
test("a caller-supplied owned id is used as the update target", async () => {
  const db = makeDb({
    ownership: { status: "pending_review", content_json: { a: 1 } },
    // A reusable draft also exists, but it must NOT be consulted when a valid id
    // is supplied — the supplied id wins.
    reusable: { id: "should-not-be-used" },
  });
  const target = await resolveWizardDocumentTarget(db, params("doc-owned"));
  assert.equal(target.action, "update");
  assert.equal(target.action === "update" && target.documentId, "doc-owned");
});

// ── 2. No id → reusable in-progress draft ────────────────────────────────────
test("with no supplied id, a reusable in-progress draft is reused", async () => {
  const db = makeDb({
    reusable: { id: "reuse-1" },
    // Ownership check for the reused id confirms it belongs to the caller.
    ownership: { status: "draft", content_json: {} },
  });
  const target = await resolveWizardDocumentTarget(db, params());
  assert.equal(target.action, "update");
  assert.equal(target.action === "update" && target.documentId, "reuse-1");
});

// ── 3. Foreign/stale supplied id is dropped (no IDOR), then falls back ────────
test("a foreign/stale supplied id is dropped and resolved via primary fallback", async () => {
  const db = makeDb({
    // Ownership check returns nothing → the supplied id isn't this caller's.
    ownership: null,
    // Fallback finds the caller's own editable primary document.
    primary: { id: "primary-own", status: "draft", content_json: {}, draft_text: "hi" },
  });
  const target = await resolveWizardDocumentTarget(db, params("foreign-doc"));
  assert.equal(target.action, "update");
  // Critically, the target is the caller's own primary, never the foreign id.
  assert.equal(target.action === "update" && target.documentId, "primary-own");
});

test("a foreign supplied id with no primary fallback inserts a fresh document (never the foreign row)", async () => {
  const db = makeDb({ ownership: null, primary: null });
  const target = await resolveWizardDocumentTarget(db, params("foreign-doc"));
  assert.equal(target.action, "insert");
});

// ── 4. Primary-document fallback: editable → update in place (no duplicate) ───
test("an editable primary document is updated in place instead of inserting a duplicate", async () => {
  for (const status of ["draft", "changes_requested", "pre_warmed", null]) {
    const db = makeDb({
      reusable: null,
      primary: { id: "primary-1", status, content_json: { k: "v" }, draft_text: "d" },
    });
    const target = await resolveWizardDocumentTarget(db, params());
    assert.equal(target.action, "update", `status=${status} should update in place`);
    assert.equal(target.action === "update" && target.documentId, "primary-1");
  }
});

// ── 4b. Finalized/in-review primary → neither insert nor overwrite ────────────
test("a finalized/in-review primary document resolves to already_finalized (no duplicate, no overwrite)", async () => {
  for (const status of ["pending_review", "approved", "delivered"]) {
    const db = makeDb({
      reusable: null,
      primary: { id: "primary-final", status, content_json: {}, draft_text: "canonical" },
    });
    const target = await resolveWizardDocumentTarget(db, params());
    assert.equal(target.action, "already_finalized", `status=${status} must not be overwritten`);
    assert.equal(
      target.action === "already_finalized" && target.document.id,
      "primary-final"
    );
  }
});

// ── 5. Nothing exists → insert ───────────────────────────────────────────────
test("when no candidate document exists, a fresh document is inserted", async () => {
  const db = makeDb({ reusable: null, primary: null });
  const target = await resolveWizardDocumentTarget(db, params());
  assert.equal(target.action, "insert");
});
