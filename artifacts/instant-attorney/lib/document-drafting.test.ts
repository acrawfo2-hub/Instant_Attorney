import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { draftInstrument } from "./document-drafting.ts";
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

const RISK_GATE_OWNER = "lib/document-drafting.ts";
const RISK_GATE_HOME = "lib/document-risk.ts";

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

test("the risk gate has exactly one caller — drafting cannot route around it", async () => {
  const callers: string[] = [];

  for (const root of ["app", "lib", "components"]) {
    for (const path of await sourceFiles(root)) {
      if (path === RISK_GATE_HOME) continue;
      const src = stripComments(await readFile(path, "utf8"));
      if (/\b(?:classifyInstrumentRisk|hasRequiredForum)\b/.test(src)) callers.push(path);
    }
  }

  assert.deepEqual(
    callers.sort(),
    [RISK_GATE_OWNER],
    `The jurisdiction risk gate belongs to the drafting engine and nothing else ` +
      `may call it. A second caller means a second way to generate a document, ` +
      `and the one that forgets the gate drafts a high-risk instrument against an ` +
      `assumed forum. Call draftInstrument (${RISK_GATE_OWNER}) instead:\n  ${callers.join("\n  ")}`
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

test("a high-risk instrument with no forum blocks before any model call", async () => {
  const { client, seen } = stubClient("---DRAFT READY---text---END DRAFT---");

  const result = await draftInstrument(client, {
    wizardType: "complaint_letter",
    instrumentLabel: "Original Petition",
    caseFile: caseFile(null),
    facts: [],
    messages: [{ role: "user", content: "Draft it." }],
  });

  assert.equal(result.kind, "blocked");
  assert.equal(seen.model, undefined, "the model must not be called when the forum is unknown");
});

test("a markerless response is recovery material, never a draft", async () => {
  const { client } = stubClient("Here is your letter, all done.");

  const result = await draftInstrument(client, {
    wizardType: "general_document",
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
    wizardType: "general_document",
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
    wizardType: "demand_letter",
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
    wizardType: "general_document",
    caseFile: caseFile("Texas"),
    facts: [],
    messages: [{ role: "user", content: "Draft it." }],
  });

  assert.equal(result.kind, "error");
});
