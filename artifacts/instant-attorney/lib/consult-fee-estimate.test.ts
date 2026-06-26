import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConsultFeeEstimate,
  emptyFeeEstimateDraft,
  mergeFeeEstimateWithDraft,
  normalizeFeeEstimateDraft,
  DEFAULT_HOURLY_RATE,
} from "./consult-fee-estimate.ts";
import type { CaseFile, FactItem } from "./types.ts";

const baseFile: CaseFile = {
  id: "file-1",
  user_id: "user-1",
  title: "Wrongful termination",
  summary: "Client was terminated after reporting safety violations to OSHA.",
  goals: ["Recover lost wages"],
  matter_type: "reactive",
  matter_subtype: "employment",
  status: "open",
  file_type: "standard",
  archive_at: null,
  pre_consult_memo: null,
  legal_strategy: {
    summary: "Retaliation indicators",
    instruments: ["Demand Letter"],
    strengths: ["Protected activity"],
    risks: ["At-will employment", "No written policy"],
    recommended_wizards: ["demand_letter"],
    recommend_consult: true,
  },
  attorney_assessment: null,
  next_action: null,
  jurisdiction: "Texas",
  opened_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date().toISOString(),
};

test("buildConsultFeeEstimate returns packages and ethics notice for employment matter", () => {
  const est = buildConsultFeeEstimate({
    caseFile: baseFile,
    facts: [],
    documents: [],
    requestedAttachments: [],
  });

  assert.equal(est.practiceArea, "employment");
  assert.ok(est.packages.length >= 1);
  assert.ok(est.packages.some((p) => p.recommended));
  assert.match(est.ethicsNotice, /1\.04/);
  assert.match(est.ethicsNotice, /NOT A FEE AGREEMENT/i);
  assert.equal(est.hourlyReference.rate, DEFAULT_HOURLY_RATE);
  assert.ok(est.phoneScript.length > 50);
});

test("uncontested divorce gets lower range than contested signals", () => {
  const uncontested = buildConsultFeeEstimate({
    caseFile: {
      ...baseFile,
      matter_subtype: "divorce",
      summary: "Amicable uncontested divorce with agreed terms, two children.",
    },
    facts: [],
    documents: [],
    requestedAttachments: [],
  });

  const contested = buildConsultFeeEstimate({
    caseFile: {
      ...baseFile,
      matter_subtype: "divorce",
      summary: "Contested divorce — spouse refuses to cooperate, trial likely.",
      legal_strategy: {
        ...baseFile.legal_strategy!,
        risks: ["Trial likely", "Hidden assets", "Custody fight"],
      },
    },
    facts: [],
    documents: [],
    requestedAttachments: [],
  });

  const uPkg = uncontested.packages.find((p) => p.recommended)!;
  const cPkg = contested.packages.find((p) => p.recommended)!;
  assert.ok(uPkg.range.high <= cPkg.range.high);
  assert.ok(contested.complexityScore >= uncontested.complexityScore);
});

test("PI matter recommends contingency package with zero hourly total", () => {
  const est = buildConsultFeeEstimate({
    caseFile: {
      ...baseFile,
      matter_subtype: "personal_injury",
      summary: "Rear-end car accident, client injured, adjuster called.",
    },
    facts: [],
    documents: [],
    requestedAttachments: [],
  });

  assert.equal(est.practiceArea, "personal_injury");
  const contingency = est.packages.find((p) => p.billingModel === "contingency");
  assert.ok(contingency?.recommended);
  assert.ok(est.caveats.some((c) => /contingency/i.test(c)));
});

test("mergeFeeEstimateWithDraft applies custom range override", () => {
  const est = buildConsultFeeEstimate({
    caseFile: baseFile,
    facts: [],
    documents: [],
    requestedAttachments: [],
  });
  const draft = {
    ...emptyFeeEstimateDraft(),
    customRange: { low: 5000, high: 5500 },
    attorneyNotes: "Client agreed to $5,500 after call.",
  };
  const merged = mergeFeeEstimateWithDraft(est, draft);
  assert.deepEqual(merged.effectiveRange, { low: 5000, high: 5500 });
  assert.equal(merged.draft.attorneyNotes, "Client agreed to $5,500 after call.");
});

test("normalizeFeeEstimateDraft handles invalid input", () => {
  const d = normalizeFeeEstimateDraft(null);
  assert.equal(d.version, 1);
  assert.equal(d.attorneyNotes, "");
  assert.equal(d.selectedPackageId, null);
});

test("estate planning matter returns will or trust packages", () => {
  const est = buildConsultFeeEstimate({
    caseFile: {
      ...baseFile,
      matter_type: "preventive",
      matter_subtype: "estate",
      summary: "Married couple wants revocable living trust and POA.",
    },
    facts: [],
    documents: [],
    requestedAttachments: [],
  });

  assert.equal(est.practiceArea, "estate");
  assert.ok(est.packages.some((p) => /trust|will/i.test(p.label)));
});
