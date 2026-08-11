import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Packer } from "docx";
import { draftTextToDocumentModel, renderDocumentModel, validateDocumentModel, type DocumentProfileName } from "./doc-layout.ts";

const fixtures: Array<[string, DocumentProfileName, string, string]> = [
  ["letter", "correspondence", "# Re: Records\n    Indented response requested.", "Re: Records"],
  ["pleading", "pleading", "[[CAPTION]]\nIN THE DISTRICT COURT\nPLAINTIFF v. DEFENDANT\n[[/CAPTION]]\n1. Plaintiff complains.", "DISTRICT COURT"],
  ["will", "estate-instrument", "# LAST WILL\n1. I revoke prior wills.\n[[NOTARY]]\nSTATE OF TEXAS\n[[/NOTARY]]", "LAST WILL"],
  ["trust", "estate-instrument", "# TRUST AGREEMENT\n1. Trustee shall administer.\n[[EXHIBIT: Schedule A]]\n| Asset | Owner |\n|---|---|\n| Cash | Trust |", "Schedule A"],
  ["records request", "administrative-request", "# PUBLIC INFORMATION REQUEST\n| Category | Date range |\n|---|---|\n| Emails | 2025 |\n[[SIGNATURE]]\nRespectfully,\nRequester\n[[/SIGNATURE]]", "PUBLIC INFORMATION REQUEST"],
];
for (const [kind, profile, source, expected] of fixtures) test(`${kind} model and document XML snapshot`, async () => {
  const model = draftTextToDocumentModel(kind, source);
  validateDocumentModel(model, profile);
  if (kind === "letter") assert.deepEqual(model.blocks[1], { type: "paragraph", text: "Indented response requested.", indent: 4 });
  const buffer = await Packer.toBuffer(renderDocumentModel(model, profile));
  const dir = mkdtempSync(join(tmpdir(), "doc-layout-")), file = join(dir, "document.docx"); writeFileSync(file, buffer);
  const xml = execFileSync("unzip", ["-p", file, "word/document.xml"], { encoding: "utf8" });
  assert.match(xml, new RegExp(expected.replace(/ /g, ".*")));
  assert.match(xml, /w:pgMar/);
  assert.doesNotMatch(xml, /\|---\|/);
});
test("profile validation rejects constructs the profile forbids", () => {
  assert.throws(() => validateDocumentModel({ title: "Letter", blocks: [{ type: "table", rows: [["x"]] }] }, "correspondence"), /Table not permitted/);
});
