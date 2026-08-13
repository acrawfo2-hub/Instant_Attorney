import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { draftInstrument, FORUM_PLACEHOLDER } from "./document-drafting.ts";
import { placeholderFields } from "./placeholder-parsing.ts";
import type { CaseFile, FactItem } from "./types.ts";

// ── The guard ──────────────────────────────────────────────────────────────
//
// Document text is produced in exactly one place. The Generation pipeline —
// identity, authority, spec, risk gate, generate, refine, validate — used to
// live inline in app/api/wizard/route.ts, reachable only from the wizard
// journey, while the orchestrator's durable worker ran its own twelve-line
// Anthropic call with none of the stages. Two implementations, and the one the
// orchestrator used was the one without the legal-quality gates.
//
// The risk gate is what this pins, because it is the rule with the worst
// failure mode: a high-risk instrument drafted against an assumed jurisdiction
// is wrong in a way that reads as finished work. Removing that block has been
// attempted twice. Confining classifyInstrumentRisk and hasRequiredForum to the
// drafting engine means no new path can generate a document without passing it —
// not because the author remembered to call it, but because generating at all
// means going through the engine.

const DRAFTING_ENGINE = "lib/document-drafting.ts";

/**
 * The one file allowed to build the drafter prompt without being a generation
 * path. `chat-edit` PROPOSES changes to an existing document and never writes
 * one — the propose-then-accept rule in ARCHITECTURE.md, which three PRs have
 * tried to break. It produces a diff for the attorney to accept, not a document.
 *
 * Keep this set at one entry. Adding to it to make the test pass is how the
 * second implementation gets back in.
 */
const NOT_DRAFTING = new Set(["app/api/attorney/documents/[id]/chat-edit/route.ts"]);

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

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("only the engine builds a document-drafting model call", async () => {
  // The earlier version of this guard pinned classifyInstrumentRisk and
  // hasRequiredForum to one caller, which asked the wrong question. It caught a
  // second *consumer* of the gate, not a generation path that never calls the
  // gate at all — so app/api/documents/[id]/regenerate/route.ts sailed through
  // it while running its own Anthropic call with no risk gate, no pinned
  // authority, no spec, no validator, and a fallback that promoted a markerless
  // response to renderable draft_text.
  //
  // What identifies a drafting path is the drafter prompt, not the gate. So this
  // looks for the prompt instead: any file that assembles buildDrafterSystemPrompt
  // or DRAFTER_SYSTEM_PROMPT into a model call is producing document text and
  // must do it through draftInstrument.
  const offenders: string[] = [];

  for (const root of ["app", "lib"]) {
    for (const path of await sourceFiles(root)) {
      if (path === DRAFTING_ENGINE || path === "lib/prompts.ts" || NOT_DRAFTING.has(path)) continue;
      const src = stripComments(await readFile(path, "utf8"));
      if (/\b(?:buildDrafterSystemPrompt|DRAFTER_SYSTEM_PROMPT)\b/.test(src)) offenders.push(path);
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `These files assemble the drafter prompt themselves, which means a second ` +
      `implementation of document generation — and the copy that forgets a stage ` +
      `is the one that drafts against an unconfirmed forum or saves a markerless ` +
      `response as a finished draft. Both have happened. Call draftInstrument ` +
      `(${DRAFTING_ENGINE}) instead:\n  ${offenders.join("\n  ")}`
  );
});

test("the risk gate is reachable from only the engine", async () => {
  const callers: string[] = [];

  for (const root of ["app", "lib", "components"]) {
    for (const path of await sourceFiles(root)) {
      if (path === "lib/document-risk.ts") continue;
      const src = stripComments(await readFile(path, "utf8"));
      if (/\b(?:classifyInstrumentRisk|hasRequiredForum)\b/.test(src)) callers.push(path);
    }
  }

  assert.deepEqual(
    callers.sort(),
    [DRAFTING_ENGINE],
    `The forum gate belongs to the drafting engine. A second caller is a second ` +
      `opinion about when a forum is required:\n  ${callers.join("\n  ")}`
  );
});

// ── Behaviour ──────────────────────────────────────────────────────────────

const caseFile = (jurisdiction: string | null) =>
  ({ id: "case-1", jurisdiction, legal_strategy: {} } as unknown as CaseFile);

const fact = (description: string, status: "confirmed" | "gap" = "confirmed") =>
  ({ description, status } as unknown as FactItem);

/** Minimal Anthropic stand-in: records the request, returns a canned response. */
function stubClient(text: string, stopReason = "end_turn") {
  const seen: { system?: unknown; model?: string } = {};
  return {
    seen,
    client: {
      messages: {
        stream(args: { system?: unknown; model?: string }) {
          seen.system = args.system;
          seen.model = args.model;
          return {
            finalMessage: async () => ({
              content: [{ type: "text", text }],
              stop_reason: stopReason,
              model: "claude-sonnet-4-6",
              usage: { output_tokens: 10 },
            }),
          };
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

test("an unknown forum still produces a draft, and forbids the model from guessing", async () => {
  const { client, seen } = stubClient("---DRAFT READY---\ntext\n---END DRAFT---");

  const result = await draftInstrument(client, {
    instrumentType: "complaint_letter",
    instrumentLabel: "Original Petition",
    caseFile: caseFile(null),
    facts: [],
    messages: [{ role: "user", content: "Draft it." }],
  });

  // Refusing was the old behaviour, and it left the client with nothing. The
  // rule that survives is "never guess a forum", not "never draft".
  assert.equal(result.kind, "generated");
  if (result.kind !== "generated") return;
  assert.equal(result.draftText, "text");
  assert.ok(result.forumDeficiency, "the gap is reported so callers can surface it");
  assert.equal(result.forumDeficiency?.code, "MISSING_GOVERNING_FORUM");

  const system = (seen.system as Array<{ text: string }>).map((b) => b.text).join("\n");
  assert.match(system, /GOVERNING FORUM NOT ESTABLISHED/);
  assert.match(system, /must NOT name, assume, or imply/);
  assert.match(system, /\[\[GOVERNING COURT OR JURISDICTION — BLOCKING:/);
});

test("the forum placeholder is required, so the client is asked for it", () => {
  // It travels through the machinery that already exists for missing facts —
  // no separate screen, no separate concept.
  const [field] = placeholderFields(`The court is ${FORUM_PLACEHOLDER}.`);
  assert.equal(field.required, true);
  assert.match(field.label, /governing court or jurisdiction/i);
});

test("a known forum adds no directive and reports no deficiency", async () => {
  const { client, seen } = stubClient("---DRAFT READY---\ntext\n---END DRAFT---");

  const result = await draftInstrument(client, {
    instrumentType: "complaint_letter",
    instrumentLabel: "Original Petition",
    caseFile: caseFile("Texas — Travis County District Court"),
    facts: [],
    messages: [{ role: "user", content: "Draft it." }],
  });

  assert.equal(result.kind, "generated");
  if (result.kind !== "generated") return;
  assert.equal(result.forumDeficiency, null);
  const system = (seen.system as Array<{ text: string }>).map((b) => b.text).join("\n");
  assert.doesNotMatch(system, /GOVERNING FORUM NOT ESTABLISHED/);
});

test("a markerless response is recovery material, never a draft", async () => {
  const { client } = stubClient("Here is your letter, all done.");

  const result = await draftInstrument(client, {
    instrumentType: "general_document",
    caseFile: caseFile("Texas"),
    facts: [fact("The lease ended 2026-01-01")],
    messages: [{ role: "user", content: "Draft it." }],
  });

  assert.equal(result.kind, "generated");
  if (result.kind !== "generated") return;
  assert.equal(result.draftText, null);
  assert.equal(result.incompleteReason, "missing_draft_block");
  assert.match(result.fullResponse, /all done/, "the raw response is kept for recovery");
});

test("a draft block that never closed is not renderable", async () => {
  const { client } = stubClient("---DRAFT READY---\nDear Sir,", "max_tokens");

  const result = await draftInstrument(client, {
    instrumentType: "general_document",
    caseFile: caseFile("Texas"),
    facts: [],
    messages: [{ role: "user", content: "Draft it." }],
  });

  assert.equal(result.kind, "generated");
  if (result.kind !== "generated") return;
  assert.equal(result.truncated, true);
  // extractDraftText salvages a block that opened but never closed, so a
  // truncated run can still yield text and incompleteReason stays null. That is
  // why `truncated` is reported separately and the two callers diverge on it:
  // the wizard route saves the text with a flag a person can act on, and
  // document-job-worker refuses, because nothing is watching its output.
  assert.equal(result.incompleteReason, null);
  assert.equal(result.draftText, "Dear Sir,");
});

test("a complete block is extracted and the instrument label reaches the prompt", async () => {
  const { client, seen } = stubClient("---DRAFT READY---\nDear Sir,\n---END DRAFT---");

  const result = await draftInstrument(client, {
    instrumentType: "demand_letter",
    instrumentLabel: "Demand Letter",
    caseFile: caseFile("Texas"),
    facts: [fact("Unpaid invoice of $4,200")],
    messages: [{ role: "user", content: "Draft it." }],
  });

  assert.equal(result.kind, "generated");
  if (result.kind !== "generated") return;
  assert.equal(result.draftText, "Dear Sir,");
  assert.equal(result.incompleteReason, null);

  const system = seen.system as Array<{ text: string }>;
  assert.match(system[1].text, /Demand Letter/, "the instrument being drafted is named in the prompt");
});

test("a model failure is returned, not thrown", async () => {
  const client = {
    messages: {
      stream() {
        return { finalMessage: async () => { throw new Error("upstream exploded"); } };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const result = await draftInstrument(client, {
    instrumentType: "general_document",
    caseFile: caseFile("Texas"),
    facts: [],
    messages: [{ role: "user", content: "Draft it." }],
  });

  assert.equal(result.kind, "error");
});
