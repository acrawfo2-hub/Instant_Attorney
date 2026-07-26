import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatterTasks } from "./matter-tasks.ts";
import type { CaseFile, FactItem, Document, RequestedAttachment, GovFormInstrument } from "./types.ts";

// Minimal-but-valid fixtures. The transform only reads a handful of fields; the
// casts keep the test focused on bucketing/ranking, not on filling every column.
function caseFile(over: Partial<CaseFile> = {}): CaseFile {
  return {
    id: "cf1",
    user_id: "u1",
    matter_type: "reactive",
    matter_subtype: null,
    status: "open",
    file_type: "standard",
    // Set so the counsel-intake nudge doesn't add noise to the board.
    counsel_intake_at: "2026-01-01T00:00:00Z",
    jurisdiction: "Texas",
    legal_strategy: null,
    goals: [],
    summary: "A test matter.",
    title: "Test",
    ...over,
  } as unknown as CaseFile;
}

function fact(over: Partial<FactItem>): FactItem {
  return {
    id: "f1", case_file_id: "cf1", user_id: "u1",
    description: "d", status: "gap", created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as unknown as FactItem;
}

function doc(over: Partial<Document>): Document {
  return {
    id: "d1", case_file_id: "cf1", user_id: "u1", doc_type: "general_document",
    title: "My Letter", status: "draft", created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as unknown as Document;
}

function reqAtt(over: Partial<RequestedAttachment>): RequestedAttachment {
  return {
    id: "r1", case_file_id: "cf1", user_id: "u1", description: "Pay stubs",
    reason: null, status: "requested", fulfilled_by: null, source: "ai",
    created_at: "2026-01-01T00:00:00Z", ...over,
  } as unknown as RequestedAttachment;
}

function govForm(over: Partial<GovFormInstrument>): GovFormInstrument {
  return {
    id: "g1", case_file_id: "cf1", user_id: "u1", form_key: "form-x",
    status: "needed", reason: null, answers: {}, source: "dynamic",
    form_def: null, lookup_status: "pending", created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z", ...over,
  } as unknown as GovFormInstrument;
}

test("buckets: finalized records land in done; open actions in doable-now; external waits in blocked", () => {
  const result = buildMatterTasks({
    caseFile: caseFile(),
    facts: [fact({ id: "gap1", status: "gap", description: "Date of the incident" })],
    documents: [doc({ id: "approved1", status: "approved", title: "Demand Letter" })],
    requestedAttachments: [
      reqAtt({ id: "req1", status: "requested", description: "Pay stubs" }),
      reqAtt({ id: "req2", status: "uploaded", description: "ID card" }),
    ],
    govForms: [
      govForm({ id: "gpend", status: "needed", source: "dynamic", lookup_status: "pending" }),
      govForm({ id: "gdone", status: "completed", form_def: { title: "SS-4" } as GovFormInstrument["form_def"] }),
    ],
    mode: "client",
  });

  // DONE: the approved document, the uploaded request, and the completed form.
  assert.equal(result.done.length, 3);
  assert.ok(result.done.every((t) => t.status === "done"));
  assert.ok(result.done.some((t) => t.title.includes("Demand Letter")));
  assert.ok(result.done.some((t) => t.title.includes("ID card")));

  // BLOCKED: the form still awaiting its official-details lookup.
  assert.ok(result.blocked.some((t) => t.id === "form:gpend"));
  assert.ok(result.blocked.every((t) => t.status === "blocked"));
  assert.ok(result.blocked.every((t) => (t.blockedBy?.length ?? 0) > 0));

  // DOABLE NOW: the fact gap and the requested upload are things the user can act on.
  assert.ok(result.doableNow.every((t) => t.status === "doable_now"));
  assert.ok(result.doableNow.some((t) => t.id === "gap:gap1"));
  assert.ok(result.doableNow.some((t) => t.id === "upload:req1"));
});

test("no invented tasks: ':more' rollup rows are excluded", () => {
  // Enough gaps to trigger Mission Control's "N more details needed" rollup.
  const facts = Array.from({ length: 6 }, (_, i) =>
    fact({ id: `gap${i}`, status: "gap", description: `detail ${i}` }),
  );
  const result = buildMatterTasks({ caseFile: caseFile(), facts, documents: [], mode: "client" });
  assert.ok(result.all.every((t) => !t.id.endsWith(":more")));
});

test("ranking: within a bucket, more-urgent tasks sort ahead of normal ones", () => {
  const result = buildMatterTasks({
    caseFile: caseFile(),
    facts: [fact({ id: "gapU", status: "gap", description: "urgent gap" })],
    documents: [],
    requestedAttachments: [reqAtt({ id: "reqU", status: "requested" })],
    mode: "client",
  });
  const order = { expired: 0, critical: 1, warning: 2, normal: 3 } as const;
  for (let i = 1; i < result.doableNow.length; i++) {
    assert.ok(
      order[result.doableNow[i - 1].urgency] <= order[result.doableNow[i].urgency],
      "doable-now tasks must be ordered by non-decreasing urgency rank",
    );
  }
});

test("counts match bucket lengths and the flat list", () => {
  const result = buildMatterTasks({ caseFile: caseFile(), facts: [], documents: [], mode: "client" });
  assert.equal(result.counts.done, result.done.length);
  assert.equal(result.counts.doableNow, result.doableNow.length);
  assert.equal(result.counts.blocked, result.blocked.length);
  assert.equal(result.all.length, result.done.length + result.doableNow.length + result.blocked.length);
});
