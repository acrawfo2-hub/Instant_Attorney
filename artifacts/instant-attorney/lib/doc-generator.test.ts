import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * One renderer for the client's legal draft.
 *
 * `lib/doc-generator.ts` used to hold two unrelated ways of producing a .docx:
 *
 *   1. `generateDocxFromText(title, draftText, profile, …)` — takes the draft
 *      the generation pipeline produced and wraps it in the firm shell. This is
 *      the live one, and the only one that has ever seen a real draft.
 *   2. `generateDocument({ docType, wizardData, … })` — switched on the
 *      instrument type and hand-assembled a document from a bag of form fields,
 *      one template function per instrument. It was the wizard's renderer.
 *
 * The wizard journey was retired; (2) survived it by eight months and roughly
 * 700 lines, importing cleanly, typechecking cleanly, called by nothing. That is
 * the shape this repository keeps producing: a second implementation that is
 * indistinguishable from live code until you count its callers.
 *
 * The guard is on the module's public surface rather than on any one deleted
 * name, because the next one will not be called `generateDocument`. Adding an
 * export here is not forbidden — it is a decision that has to be made on
 * purpose, in a diff that says so.
 */

const EXPECTED_EXPORTS = [
  // Draft text → .docx. The one path a client's document takes.
  "generateDocxFromText",
  // Deterministic checklist of the [[placeholders]] still open in a draft.
  // No model call, no per-instrument branching — a report about a draft,
  // not a second way of building one.
  "generateNeededInfoDocx",
  // Content-Disposition helper. Latin-1 header safety, not rendering.
  "docxContentDisposition",
  // Status predicate: is this document the client's to read yet.
  "isAttorneyApproved",
  // Re-exports from doc-layout, kept so callers have one import site.
  "DOCUMENT_PROFILES",
  "draftTextToDocumentModel",
  "validateDocumentModel",
  "profileForDocumentType",
];

async function docGeneratorSource(): Promise<string> {
  return readFile(new URL("./doc-generator.ts", import.meta.url), "utf8");
}

test("doc-generator exports exactly one way to render a draft", async () => {
  const mod = await import("./doc-generator.ts");
  const actual = Object.keys(mod).sort();

  assert.deepEqual(
    actual,
    [...EXPECTED_EXPORTS].sort(),
    "lib/doc-generator.ts changed its public surface. If you added a second " +
      "renderer, delete it and extend generateDocxFromText instead. If the new " +
      "export is genuinely something else, add it to EXPECTED_EXPORTS above " +
      "with a line saying what it is.",
  );
});

test("no per-instrument document templates", async () => {
  const src = await docGeneratorSource();

  // The retired renderer's signature: a bag of form answers, threaded into a
  // template chosen by instrument type. Both halves are named here because
  // either one alone is how it grows back.
  assert.equal(
    /\bwizardData\b/.test(src),
    false,
    "wizardData is the retired wizard's form-field bag. A document is rendered " +
      "from its draft text, not from a Record<string, unknown> of answers.",
  );

  assert.equal(
    /switch\s*\(\s*[\w.]*\b(docType|instrumentType|instrumentKey)\b\s*\)/.test(src),
    false,
    "Branching the renderer on instrument type is how seven near-identical " +
      "template functions got here last time. Per-instrument guidance belongs " +
      "in the generation spec (lib/document-generation-spec.ts), which shapes " +
      "what the model writes — not in a second .docx assembler.",
  );
});
