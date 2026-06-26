// ── Legal-data freshness registry ────────────────────────────────────────────
//
// The single, auditable list of time-sensitive legal values the app encodes, so
// a scheduled scan (scripts/check-legal-freshness.ts + the legal-freshness
// GitHub Action) can flag anything due for re-verification. Add an entry here
// whenever you hardcode a statutory figure, a guideline value, or lean on a set
// of statutes / forms that can change.
//
// Authoring rules:
// - `currentValue` is documentary; the code/registry it points to is the source
//   of truth. Keep them in sync when you change one.
// - Set `verifiedOn` to the date you actually confirmed the value against
//   `sourceUrl`. Use `suggestReviewAfter(verifiedOn, volatility, nextExpectedChange)`
//   to pick `reviewAfter` so cadences stay consistent.
// - For values with a known future change date, set `nextExpectedChange` so the
//   scan can anticipate it.

import type { FreshnessItem } from "./scan.ts";

export const LEGAL_FRESHNESS_ITEMS: FreshnessItem[] = [
  {
    id: "employment-law-registry",
    label: "Employment & labor law registry (EEOC deadlines, FLSA, non-compete)",
    area: "employment",
    volatility: "catalog",
    currentValue:
      "EEOC 300-day / TWC 180-day charge deadlines; FLSA overtime + exempt-salary thresholds; Tex. non-compete § 15.50; OWBPA severance timing",
    sourceUrl: "https://www.eeoc.gov/time-limits-filing-charge",
    verifiedOn: "2026-06-25",
    reviewAfter: "2027-06-25",
    notes:
      "Code: lib/employment-statutes.ts (+ claim/non-compete assessments). The FLSA exempt-salary threshold and EEOC/NLRB guidance change more often than the statutes — re-check annually and after rulemaking.",
  },
  {
    id: "tx-defamation-statutes",
    label: "Texas defamation law registry (Ch. 73, TCPA Ch. 27, 1-yr SOL)",
    area: "defamation",
    volatility: "catalog",
    currentValue:
      "Ch. 73 (libel + Defamation Mitigation Act), Ch. 27 (anti-SLAPP/TCPA), § 16.002 (1-year SOL), § 230 platform immunity",
    sourceUrl: "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.73.htm",
    verifiedOn: "2026-06-25",
    reviewAfter: "2027-10-01",
    nextExpectedChange: "2027-09-01",
    notes:
      "Code: lib/defamation-statutes.ts. The TCPA (anti-SLAPP) has been amended repeatedly — re-check after each Texas legislative session.",
  },
  {
    id: "means-test-707b-thresholds",
    label: "§ 707(b)(2) means-test presumption thresholds",
    area: "bankruptcy",
    volatility: "indexed-dollar",
    currentValue: "Lower $10,275 / Upper $17,150, effective Apr 1, 2025",
    sourceUrl: "https://www.justice.gov/ust/means-testing",
    verifiedOn: "2026-06-24",
    reviewAfter: "2027-06-24",
    effectiveDate: "2025-04-01",
    nextExpectedChange: "2028-04-01",
    notes:
      "Code: MEANS_TEST_THRESHOLDS in lib/bankruptcy-disposable-income.ts. Adjusted every 3 years on April 1.",
  },
  {
    id: "irs-collection-financial-standards",
    label: "IRS Collection Financial Standards (means-test expenses)",
    area: "bankruptcy",
    volatility: "indexed-dollar",
    currentValue: "National + Local Standards (food/housing/transportation) — used as allowed-expense inputs",
    sourceUrl: "https://www.irs.gov/businesses/small-businesses-self-employed/collection-financial-standards",
    verifiedOn: "2026-06-24",
    reviewAfter: "2027-04-01",
    notes:
      "Not encoded (county-specific, large). The full means-test step (lib/bankruptcy-disposable-income.ts) takes expenses as input; the tool links users here. IRS updates these about annually.",
  },
  {
    id: "tx-personal-property-exemption-cap",
    label: "Texas personal-property exemption cap (§ 42.001)",
    area: "bankruptcy",
    volatility: "statute",
    currentValue: "$100,000 family / $50,000 single adult",
    sourceUrl: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.42.htm",
    verifiedOn: "2026-06-24",
    reviewAfter: "2027-10-01",
    nextExpectedChange: "2027-09-01",
    notes:
      "Code: TX_EXEMPTION_CAP in lib/bankruptcy-exemptions.ts. Statutory — changes only by amendment; re-check after each Texas legislative session.",
  },
  {
    id: "tx-means-test-median-income",
    label: "Texas median family income (Chapter 7 means test)",
    area: "bankruptcy",
    volatility: "indexed-dollar",
    currentValue:
      "Household 1:$65,123 · 2:$84,491 · 3:$96,728 · 4:$114,938 (+$11,100/addl), effective Nov 1, 2025",
    sourceUrl: "https://www.justice.gov/ust/means-testing",
    verifiedOn: "2026-06-24",
    reviewAfter: "2026-08-01",
    effectiveDate: "2025-11-01",
    nextExpectedChange: "2026-11-01",
    notes:
      "Code: TX_MEANS_TEST in lib/bankruptcy-means-test.ts. The U.S. Trustee updates these figures about twice a year (≈ Nov 1 and a spring update) — verify against the current UST table; a spring-2026 update may already apply.",
  },
  {
    id: "tx-child-support-net-resources-cap",
    label: "Texas child-support net-resources cap (§ 154.125)",
    area: "family",
    volatility: "indexed-dollar",
    currentValue: "$11,700 / month, effective Sept 1, 2025 (was $9,200 from 2019)",
    sourceUrl: "https://www.texasattorneygeneral.gov/child-support/child-support-guidelines-review",
    verifiedOn: "2026-06-24",
    reviewAfter: "2027-06-24",
    effectiveDate: "2025-09-01",
    nextExpectedChange: "2031-09-01",
    notes:
      "Code: DEFAULT_NET_RESOURCES_CAP in lib/family-support-calc.ts must equal this. OAG adjusts every 6 years.",
  },
  {
    id: "tx-spousal-maintenance-limits",
    label: "Texas spousal-maintenance amount cap & percentage (§ 8.055)",
    area: "family",
    volatility: "statute",
    currentValue: "Lesser of $5,000 / month or 20% of payor's average monthly gross income",
    sourceUrl: "https://statutes.capitol.texas.gov/Docs/FA/htm/FA.8.htm",
    verifiedOn: "2026-06-24",
    reviewAfter: "2028-06-24",
    notes:
      "Code: MAINTENANCE_ABSOLUTE_CAP ($5,000) and MAINTENANCE_GROSS_PCT (0.2) in lib/family-maintenance-calc.ts. Fixed by statute — changes only by legislative amendment.",
  },
  {
    id: "tx-family-code-registry",
    label: "Texas Family Code statute registry",
    area: "family",
    volatility: "catalog",
    currentValue:
      "Ch. 3, 4, 6, 7, 8, 85, 153, 154, 156, 157, 160 — summaries, rights, deadlines, citations",
    sourceUrl: "https://statutes.capitol.texas.gov/Docs/FA/htm/FA.htm",
    verifiedOn: "2026-06-24",
    reviewAfter: "2027-10-01",
    nextExpectedChange: "2027-09-01",
    notes:
      "Code: lib/family-statutes.ts. Re-skim after each Texas legislative session (regular sessions are odd years; most laws take effect Sept 1).",
  },
  {
    id: "tx-hoa-statute-registry",
    label: "Texas HOA / property-owners' statute registry (Prop. Code Ch. 209, 202)",
    area: "hoa",
    volatility: "catalog",
    currentValue: "Ch. 209 + 202 sections — homeowner rights, deadlines, citations",
    sourceUrl: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.209.htm",
    verifiedOn: "2026-06-24",
    reviewAfter: "2027-10-01",
    nextExpectedChange: "2027-09-01",
    notes: "Code: lib/hoa-statutes.ts. Re-skim after each Texas legislative session.",
  },
  {
    id: "tx-pi-statute-registry",
    label: "Texas personal-injury statute registry",
    area: "personal-injury",
    volatility: "catalog",
    currentValue:
      "Ch. 16 limitations, Ch. 33 comparative negligence, Ch. 41 exemplary damages, Ch. 71 wrongful death, Ch. 74 med-mal, Ins. Code auto minimums",
    sourceUrl: "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.16.htm",
    verifiedOn: "2026-06-26",
    reviewAfter: "2027-10-01",
    nextExpectedChange: "2027-09-01",
    notes:
      "Code: lib/pi-statutes.ts. Re-skim after each Texas legislative session; malpractice caps and repose are statute-driven.",
  },
  {
    id: "tx-med-mal-non-economic-cap",
    label: "Texas medical-malpractice non-economic damages cap (§ 74.301)",
    area: "personal-injury",
    volatility: "statute",
    currentValue: "$250,000 per defendant physician / $500,000 overall (institutional defendants adjusted)",
    sourceUrl: "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.74.htm",
    verifiedOn: "2026-06-26",
    reviewAfter: "2028-06-26",
    notes: "Code: tx-med-mal-cap in lib/pi-statutes.ts. Changes only by legislative amendment.",
  },
  {
    id: "gov-forms-catalog",
    label: "Government form registry (revisions + official URLs)",
    area: "forms",
    volatility: "form",
    currentValue:
      "IRS W-4, USCIS I-9 / I-90, TX DL-43, voter registration, HUD-903 — revision years + official .gov URLs",
    sourceUrl: "https://www.irs.gov/forms-instructions",
    verifiedOn: "2026-06-24",
    reviewAfter: "2027-06-24",
    notes:
      "Code: lib/government-forms.ts. Confirm each form's `revision` is current and every `official_url` still resolves.",
  },
];
