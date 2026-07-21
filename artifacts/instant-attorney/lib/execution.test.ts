import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INSTRUMENT_EXECUTION,
  resolveExecution,
  isFormalitiesExecution,
  isQuickSignExecution,
  buildExecutionCoverSheet,
  executionModeLabel,
} from "./execution.ts";
import {
  FAMILY_INSTRUMENTS,
} from "./family-instruments.ts";
import {
  ESTATE_DOC_INSTRUMENTS,
} from "./estate-instruments.ts";
import {
  agreementContentHash,
  REPRESENTATION_AGREEMENT_TEXT,
  AI_CONSENT_TEXT,
} from "./agreement-sign.ts";
import { buildExecutionPacketDocx } from "./execution-packet.ts";

test("estate wills require print formalities with witnesses and notary", () => {
  const will = resolveExecution({ instrumentKey: "last_will_testament" });
  assert.equal(will.mode, "print_formalities");
  assert.equal(will.esign_allowed, false);
  assert.equal(will.needs_notary, true);
  assert.equal(will.witness_count, 2);
  assert.ok(isFormalitiesExecution(will));
  assert.equal(isQuickSignExecution(will), false);
});

test("TOD deed requires notarization and recording", () => {
  const todd = resolveExecution({ instrumentKey: "transfer_on_death_deed" });
  assert.equal(todd.needs_notary, true);
  assert.equal(todd.needs_recording, true);
  assert.equal(todd.esign_allowed, false);
});

test("waiver of service is notarized print formalities", () => {
  const w = resolveExecution({ instrumentKey: "waiver_or_answer" });
  assert.equal(w.mode, "print_formalities");
  assert.equal(w.needs_notary, true);
  assert.match(w.badge, /notar/i);
});

test("demand letters are quick-sign / send", () => {
  const d = resolveExecution({ docType: "demand_letter", title: "Demand to Employer" });
  assert.ok(isQuickSignExecution(d));
  assert.equal(d.esign_allowed, true);
});

test("contracts resolve to multi-party e-sign", () => {
  const c = resolveExecution({ docType: "draft_contract" });
  assert.equal(c.mode, "esign");
  assert.ok(c.signature_roles.length >= 2);
});

test("title heuristics catch a will without a plan key", () => {
  const w = resolveExecution({ title: "Last Will and Testament of Jane Doe", docType: "wills_trusts" });
  assert.equal(w.mode, "print_formalities");
  assert.equal(w.witness_count, 2);
});

test("every estate instrument has an execution profile", () => {
  for (const i of ESTATE_DOC_INSTRUMENTS) {
    assert.ok(INSTRUMENT_EXECUTION[i.key], `missing execution for ${i.key}`);
    assert.equal(INSTRUMENT_EXECUTION[i.key].esign_allowed, false, `${i.key} should not be casual e-sign`);
  }
});

test("family formalities instruments are identified", () => {
  for (const key of [
    "waiver_or_answer",
    "premarital_agreement",
    "marital_property_agreement",
  ]) {
    assert.ok(FAMILY_INSTRUMENTS.some((i) => i.key === key));
    assert.equal(resolveExecution({ instrumentKey: key }).mode, "print_formalities");
  }
});

test("cover sheet lists roles and notary when required", () => {
  const sheet = buildExecutionCoverSheet({
    documentTitle: "Last Will and Testament",
    execution: INSTRUMENT_EXECUTION.last_will_testament,
  });
  assert.match(sheet, /Witness 1/);
  assert.match(sheet, /Notary/);
  assert.match(sheet, /Print/);
  assert.equal(executionModeLabel("print_formalities"), "Print & execute (witnesses / notary)");
});

test("agreement content hash is stable for normalized newlines", () => {
  const a = agreementContentHash(REPRESENTATION_AGREEMENT_TEXT);
  const b = agreementContentHash(REPRESENTATION_AGREEMENT_TEXT.replace(/\n/g, "\r\n") + "\n");
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.ok(AI_CONSENT_TEXT.includes("ATTORNEY-CLIENT PRIVILEGE"));
});

test("execution packet docx builds non-empty bytes", async () => {
  const buf = await buildExecutionPacketDocx({
    documentTitle: "Statutory Durable Power of Attorney",
    execution: INSTRUMENT_EXECUTION.statutory_durable_poa,
  });
  assert.ok(buf.byteLength > 1000);
  // DOCX is a ZIP
  assert.equal(buf[0], 0x50);
  assert.equal(buf[1], 0x4b);
});
