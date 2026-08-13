import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDraftText, isCompleteFileUpdate, parseAndUpdateFile, parseDocumentPlan } from "./file-parser.ts";

// Regression: a truncated draft (model hit its token limit before emitting the
// closing ---END DRAFT--- marker) must still be extracted so it can be saved.

test("extractDraftText returns text from a well-formed draft block", () => {
  const raw = "intro\n---DRAFT READY---\nHello world\n---END DRAFT---\ntrailing";
  assert.equal(extractDraftText(raw), "Hello world");
});

test("extractDraftText recovers a truncated draft with no closing marker", () => {
  const raw = "---DRAFT READY---\nDEMAND LETTER\n\nThis firm represents the client and demands payment of $[[AMOUNT]] within";
  const out = extractDraftText(raw);
  assert.ok(out, "truncated draft should still be extracted");
  assert.ok(out!.includes("DEMAND LETTER"));
  assert.ok(!out!.includes("---DRAFT READY---"));
});

test("extractDraftText stops at the next block marker when one follows", () => {
  const raw = "---DRAFT READY---\nThe body of the draft.\n---MISSING FACTS---\nBLOCKING:\n- the amount";
  const out = extractDraftText(raw);
  assert.equal(out, "The body of the draft.");
});

test("extractDraftText returns null when no draft block is present", () => {
  assert.equal(extractDraftText("just some chatter, no markers"), null);
});

test("extractDraftText returns null for an empty draft body", () => {
  assert.equal(extractDraftText("---DRAFT READY---\n   \n---MISSING FACTS---\nBLOCKING:"), null);
});

// ── Truncation guard: a half-written FILE UPDATE must not partially apply ─────
// The wizard route gates parseAndUpdateFile on isCompleteFileUpdate. A response
// truncated before the closing ---END FILE UPDATE--- marker (model hit its token
// limit mid-block) must NOT be applied — applying it would partially write the
// Living File's structured sub-sections (facts / legal strategy) and corrupt it.

test("isCompleteFileUpdate requires BOTH the opening and closing markers", () => {
  const complete = "intro\n---FILE UPDATE---\n---LIVING FILE---\nSUMMARY: x\n---END FILE---\n---END FILE UPDATE---";
  const truncated = "intro\n---FILE UPDATE---\n---LIVING FILE---\nSUMMARY: x\n---END FILE---"; // no closing wrapper
  assert.equal(isCompleteFileUpdate(complete), true);
  assert.equal(isCompleteFileUpdate(truncated), false);
  assert.equal(isCompleteFileUpdate("no markers at all"), false);
});

// Records every table mutation so we can assert nothing was written. Reads return
// empty so any defensive read path doesn't crash.
function makeRecordingDb(ops: { table: string; op: string }[]): SupabaseClient {
  const readChain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order", "limit"]) {
    readChain[m] = () => readChain;
  }
  readChain.maybeSingle = async () => ({ data: null });
  readChain.single = async () => ({ data: null });
  (readChain as { then?: unknown }).then = (resolve: (v: { data: unknown[] }) => unknown) =>
    resolve({ data: [] });

  return {
    from(table: string) {
      return {
        select: () => readChain,
        update: () => {
          ops.push({ table, op: "update" });
          return { eq: async () => ({ error: null }) };
        },
        insert: async () => {
          ops.push({ table, op: "insert" });
          return { error: null };
        },
        upsert: async () => {
          ops.push({ table, op: "upsert" });
          return { error: null };
        },
        delete: () => ({ in: async () => ({ error: null }), eq: async () => ({ error: null }) }),
      };
    },
  } as unknown as SupabaseClient;
}

test("a truncated FILE UPDATE (no ---END FILE---) does NOT write any Living File data", async () => {
  // The inner LIVING FILE block is also cut off — its closing ---END FILE--- is
  // missing — so parseAndUpdateFile must make no mutations at all.
  const truncated = [
    "---FILE UPDATE---",
    "---LIVING FILE---",
    "MATTER TYPE: reactive — employment",
    "SUMMARY: client was wrongfully terminated and",
  ].join("\n"); // truncated here: no ---END FILE---, no ---END FILE UPDATE---

  const ops: { table: string; op: string }[] = [];
  const db = makeRecordingDb(ops);
  await parseAndUpdateFile(db, "case-1", "user-1", truncated);
  assert.deepEqual(ops, [], "no DB writes should occur for a truncated FILE UPDATE block");
});

test("a COMPLETE LIVING FILE block DOES apply (guard differentiates, not a blanket no-op)", async () => {
  const complete = [
    "---FILE UPDATE---",
    "---LIVING FILE---",
    "MATTER TYPE: reactive — employment",
    "SUMMARY: client was wrongfully terminated.",
    "---END FILE---",
    "---END FILE UPDATE---",
  ].join("\n");

  const ops: { table: string; op: string }[] = [];
  const db = makeRecordingDb(ops);
  await parseAndUpdateFile(db, "case-1", "user-1", complete);
  assert.ok(
    ops.some((o) => o.table === "case_files" && o.op === "update"),
    "a complete Living File block must update the case file"
  );
});

const PLAN_BLOCK = [
  "SUMMARY: x",
  "DOCUMENT PLAN:",
  "1. LLC Operating Agreement | draft_contract | members need it before funding",
  "2. Promissory Note | general_document | documents the loan",
  "3. Cease & Desist | general_document |",
  "RECOMMEND_CONSULT: false",
].join("\n");

test("parseDocumentPlan parses titles, engines, and rationale in order", () => {
  const plan = parseDocumentPlan(PLAN_BLOCK);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].title, "LLC Operating Agreement");
  assert.equal(plan[0].engine, "draft_contract");
  assert.equal(plan[0].rationale, "members need it before funding");
  assert.equal(plan[1].engine, "general_document");
  assert.equal(plan[2].engine, "general_document");
  assert.notEqual(plan[1].key, plan[2].key);
});

test("parseDocumentPlan defaults an unknown engine to general_document", () => {
  const plan = parseDocumentPlan("DOCUMENT PLAN:\n1. Weird Thing | not_a_real_engine | why");
  assert.equal(plan[0].engine, "general_document");
});

test("parseDocumentPlan keeps instrument identity separate from a shared engine and title", () => {
  const plan = parseDocumentPlan(`DOCUMENT PLAN:
1. Records from EPA | general_document | federal records | federal_foia_request
2. Records from Austin | general_document | state records | texas_public_information_request`);
  assert.equal(plan[0].engine, "general_document");
  assert.equal(plan[1].engine, "general_document");
  assert.equal(plan[0].instrument_key, "federal_foia_request");
  assert.equal(plan[1].instrument_key, "texas_public_information_request");
  assert.notEqual(plan[0].instrument_key, plan[1].instrument_key);
});

test("parseDocumentPlan reuses a prior key for the same title (stable identity)", () => {
  const first = parseDocumentPlan(PLAN_BLOCK);
  const opKey = first[0].key;
  const regen = parseDocumentPlan(
    "DOCUMENT PLAN:\n1. LLC Operating Agreement | draft_contract | reworded rationale",
    first,
  );
  assert.equal(regen[0].key, opKey, "same title must keep its key so progress isn't lost");
});

test("parseDocumentPlan returns [] when there is no DOCUMENT PLAN section", () => {
  assert.deepEqual(parseDocumentPlan("SUMMARY: x\nRECOMMEND_CONSULT: true"), []);
});
