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
