import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFileDeck } from "./file-deck.ts";
import { buildMatterTasks } from "./matter-tasks.ts";
import type {
  CaseFile,
  ClientWorkspaceDraft,
  ConsultRequest,
  Document,
  FactItem,
  GovFormInstrument,
  RequestedAttachment,
} from "./types.ts";

// Minimal-but-valid fixtures — the deck reads a handful of columns, so the casts
// keep each test about the distillation rather than about filling every column.

function caseFile(over: Partial<CaseFile> = {}): CaseFile {
  return {
    id: "cf1",
    user_id: "u1",
    matter_type: "reactive",
    matter_subtype: null,
    status: "open",
    file_type: "standard",
    counsel_intake_at: "2026-01-01T00:00:00Z",
    jurisdiction: "Texas",
    legal_strategy: null,
    goals: [],
    summary: "A test matter.",
    title: "Test",
    opened_at: "2026-01-01T00:00:00Z",
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
    title: "My Letter", status: "draft", parent_document_id: null,
    draft_text: null, created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as unknown as Document;
}

function wsDraft(over: Partial<ClientWorkspaceDraft>): ClientWorkspaceDraft {
  return {
    id: "w1", case_file_id: "cf1", user_id: "u1", title: "Working draft",
    content: "Body text.", source: "assistant", promoted_document_id: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...over,
  } as unknown as ClientWorkspaceDraft;
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

/** Build the deck the way ClientFileView does — tasks first, then the deck. */
function deck(over: Partial<Parameters<typeof buildFileDeck>[0]> = {}) {
  const cf = over.caseFile ?? caseFile();
  const facts = over.facts ?? [];
  const documents = over.documents ?? [];
  const requestedAttachments = over.requestedAttachments ?? [];
  const govForms = over.govForms ?? [];
  const tasks =
    over.tasks ??
    buildMatterTasks({
      caseFile: cf,
      facts,
      documents,
      requestedAttachments,
      govForms,
      mode: "client",
    });
  return buildFileDeck({
    caseFile: cf,
    facts,
    documents,
    requestedAttachments,
    govForms,
    tasks,
    now: new Date("2026-06-01T12:00:00Z"),
    ...over,
  });
}

// ── The eight stable destinations ──────────────────────────────────────────

test("tiles: always expose the same dedicated destinations in the same order", () => {
  const empty = deck();
  assert.deepEqual(
    empty.tiles.map((t) => t.id),
    ["drafted", "attorney-review", "uploads", "facts", "other-side", "financials", "deadlines", "attorney"],
  );
  assert.ok(empty.tiles.every((t) => t.status.trim().length > 0), "no tile may render a blank status");
  assert.equal(new Set(empty.tiles.map((t) => t.href)).size, empty.tiles.length);

  // Every tile resolves to a real destination the router can serve. A bare
  // "#anchor" would be a dead link now that the detail lives behind ?view=.
  assert.ok(
    empty.tiles.every((t) => t.href.startsWith("/dashboard/cf1")),
    "a tile must route, not point at an anchor that is no longer on the page",
  );

  const busy = deck({
    documents: [doc({ id: "dA", status: "pending_review" })],
    workspaceDrafts: [wsDraft({ id: "wA" })],
    requestedAttachments: [reqAtt({ id: "rA" })],
  });
  assert.deepEqual(busy.tiles.map((t) => t.id), empty.tiles.map((t) => t.id));
});

test("tiles: document work, review, and uploads have separate counts", () => {
  const d = deck({
    workspaceDrafts: [wsDraft({ id: "wA" })],
    documents: [doc({ id: "dA", status: "draft" }), doc({ id: "dB", status: "pending_review" })],
    requestedAttachments: [
      reqAtt({ id: "rA", status: "requested" }),
      reqAtt({ id: "rB", status: "uploaded" }),
    ],
  });
  assert.equal(d.tiles.find((t) => t.id === "drafted")?.count, 2);
  assert.equal(d.tiles.find((t) => t.id === "attorney-review")?.count, 1);
  assert.equal(d.tiles.find((t) => t.id === "uploads")?.count, 2);
  assert.match(d.tiles.find((t) => t.id === "uploads")!.status, /1 still needed/);
});

test("tiles: a live deadline drives the Key dates tile's status and tone", () => {
  const d = deck({
    facts: [fact({ id: "k1", status: "confirmed", description: "Key date · served_lawsuit · 2026-06-10" })],
  });
  const tile = d.tiles.find((t) => t.id === "deadlines")!;
  assert.ok((tile.count ?? 0) > 0);
  assert.match(tile.status, /left|today|passed/);
  assert.ok(tile.tone === "urgent" || tile.tone === "attention");
});

test("tiles: facts, strength check, and consult state drive distinct counts", () => {
  const d = deck({
    facts: [fact({ status: "confirmed" }), fact({ id: "f2", status: "confirmed" })],
    caseFile: caseFile({
      legal_strategy: {
        strength_check: { counterarguments: [{ attack: "No notice" }] },
      } as CaseFile["legal_strategy"],
    }),
    consultRequest: { status: "confirmed" } as unknown as ConsultRequest,
  });
  assert.equal(d.tiles.find((t) => t.id === "facts")?.count, 2);
  assert.equal(d.tiles.find((t) => t.id === "other-side")?.count, 1);
  const attorney = d.tiles.find((t) => t.id === "attorney")!;
  assert.equal(attorney.count, 1);
  assert.match(attorney.status, /confirmed/i);
  assert.equal(attorney.tone, "calm");

  const recommended = deck({
    caseFile: caseFile({ legal_strategy: { recommend_consult: true } as CaseFile["legal_strategy"] }),
  }).tiles.find((t) => t.id === "attorney")!;
  assert.match(recommended.status, /recommended/i);
  assert.equal(recommended.tone, "attention");
});

// ── Finished work, one tap away ──────────────────────────────────────────────

test("drafts: work needing her input outranks work that's merely readable or filed", () => {
  const d = deck({
    workspaceDrafts: [
      wsDraft({ id: "wReady", title: "Demand Letter", content: "All done.", updated_at: "2026-05-30T00:00:00Z" }),
      wsDraft({ id: "wBlank", title: "Petition", content: "Filed in [[County]].", updated_at: "2026-05-01T00:00:00Z" }),
    ],
    documents: [doc({ id: "dRev", title: "Affidavit", status: "pending_review" })],
  });
  assert.deepEqual(
    d.drafts.map((s) => s.title),
    ["Petition", "Demand Letter", "Affidavit"],
  );
  assert.equal(d.drafts[0].needsInfo, true);
  assert.match(d.drafts[0].meta, /1 blank to fill/);
  assert.match(d.drafts[0].href, /\/chat\?caseFileId=cf1&draft=wBlank/);
  assert.equal(d.drafts[2].meta, "With your attorney");
  assert.equal(d.drafts[2].href, "/dashboard/cf1?view=documents#doc-dRev");
});

test("drafts: capped at three, with the remainder counted rather than dropped", () => {
  const d = deck({
    workspaceDrafts: [1, 2, 3, 4, 5].map((n) =>
      wsDraft({ id: `w${n}`, title: `Draft ${n}`, updated_at: `2026-05-0${n}T00:00:00Z` }),
    ),
  });
  assert.equal(d.drafts.length, 3);
  assert.equal(d.moreDrafts, 2);
});

test("drafts: a promoted side-panel draft is not listed twice", () => {
  const d = deck({
    workspaceDrafts: [wsDraft({ id: "wP", title: "Motion", promoted_document_id: "dP" })],
    documents: [doc({ id: "dP", title: "Motion", status: "pending_review" })],
  });
  assert.equal(d.drafts.length, 1);
  assert.equal(d.drafts[0].id, "doc:dP");
});

// ── Am I OK? / What's next? ──────────────────────────────────────────────────

test("pressing: only a deadline that is actually pressing raises the top-of-file alert", () => {
  assert.equal(deck().pressing, null);

  const soon = deck({
    facts: [fact({ id: "k1", status: "confirmed", description: "Key date · served_lawsuit · 2026-06-10" })],
  });
  assert.ok(soon.pressing);
  assert.match(soon.pressing!.countdown, /left|today/);
  assert.ok(soon.pressing!.ask.includes(soon.pressing!.deadlineDate));
});

test("pressing: a deadline already blown asks the question a client would actually ask", () => {
  const d = deck({
    facts: [fact({ id: "k1", status: "confirmed", description: "Key date · served_lawsuit · 2026-01-05" })],
  });
  assert.equal(d.pressing?.urgency, "expired");
  assert.match(d.pressing!.countdown, /passed/);
  assert.match(d.pressing!.ask, /options now/);
});

test("nextStep: mirrors the top-ranked doable-now task and carries an ask for it", () => {
  const d = deck({ requestedAttachments: [reqAtt({ id: "rA", description: "Pay stubs" })] });
  assert.ok(d.nextStep);
  assert.equal(d.nextStep!.title, d.nextStep!.title.trim());
  assert.ok(!d.nextStep!.title.endsWith("."), "a button title should not trail a period");
  assert.ok(d.nextStep!.ask.includes(d.nextStep!.title));
});

// ── Action items, completable from the chat ──────────────────────────────────

test("actions: every open item carries a way to finish it, and none is left unactionable", () => {
  const d = deck({
    requestedAttachments: [reqAtt({ id: "rA", description: "Pay stubs" })],
    facts: [fact({ id: "g1", status: "gap", description: "Date of the incident" })],
  });
  assert.ok(d.actions.length > 0);
  assert.ok(d.actions.every((a) => a.ask.trim().length > 0), "an item with no ask cannot be completed");
  assert.ok(d.actions.every((a) => ["chat", "draft", "upload"].includes(a.kind)));
  assert.ok(d.actions.every((a) => a.label === a.label.trim() && !a.label.endsWith(".")));
});

test("actions: an upload request is satisfied by attaching, not by chatting about it", () => {
  const d = deck({ requestedAttachments: [reqAtt({ id: "rA", description: "Pay stubs" })] });
  const upload = d.actions.find((a) => a.id.startsWith("upload:"));
  assert.ok(upload, "the requested upload should surface as an action");
  assert.equal(upload!.kind, "upload");
});

test("actions: an item naming a draft opens that draft rather than starting a conversation", () => {
  const drafts = [wsDraft({ id: "wA", title: "Original Answer", content: "Filed in [[County]]." })];
  const cf = caseFile();
  const tasks = buildMatterTasks({ caseFile: cf, facts: [], documents: [], mode: "client" });
  // A task phrased around the document's own name — how Mission Control words these.
  tasks.doableNow.unshift({
    id: "custom:answer",
    title: "Fill in the blanks in your Original Answer",
    status: "doable_now",
    urgency: "warning",
    impact: "high",
  });
  const d = deck({ caseFile: cf, tasks, workspaceDrafts: drafts });
  const action = d.actions.find((a) => a.id === "custom:answer");
  assert.equal(action?.kind, "draft");
  assert.equal(action?.draftId, "wA");
});

test("actions: blocked work is listed too, so it reads as tracked rather than forgotten", () => {
  const d = deck({
    govForms: [govForm({ id: "gPending", status: "needed", source: "dynamic", lookup_status: "pending" })],
  });
  assert.ok(d.actions.some((a) => a.blocked), "a blocked task should still get a row");
});

test("actions: the same work promoted as a hero is not listed twice", () => {
  const cf = caseFile();
  const tasks = buildMatterTasks({ caseFile: cf, facts: [], documents: [], mode: "client" });
  const dupe = { id: "hero", title: "Upload your pay stubs", status: "doable_now", urgency: "warning", impact: "high" } as const;
  tasks.doableNow.unshift({ ...dupe }, { ...dupe, id: "upload:r1" });
  const d = deck({ caseFile: cf, tasks });
  const matching = d.actions.filter((a) => a.label === "Upload your pay stubs");
  assert.equal(matching.length, 1);
});

// ── Conversation openers ─────────────────────────────────────────────────────

test("starters: at most three, unique, and specific to what's on this file", () => {
  const d = deck({
    facts: [fact({ id: "k1", status: "confirmed", description: "Key date · served_lawsuit · 2026-06-10" })],
    workspaceDrafts: [wsDraft({ id: "wA", title: "Petition", content: "Filed in [[County]]." })],
  });
  assert.ok(d.starters.length > 0 && d.starters.length <= 3);
  assert.equal(new Set(d.starters.map((s) => s.label)).size, d.starters.length);
  assert.ok(d.starters.every((s) => s.text.trim().length > 0));
  assert.ok(d.starters.some((s) => s.text.includes("Petition")));
});

test("starters: an empty file still offers a way in", () => {
  const d = deck();
  assert.ok(d.starters.length > 0);
  assert.match(d.starters.at(-1)!.text, /plain English/);
});
