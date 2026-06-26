// ── Financial schedules & gap detection ──────────────────────────────────────
//
// Milestone 3 of docs/financial-picture-spec.md. Per-matter checklists of the
// financial buckets a matter usually needs — bankruptcy Schedules A/B/D/E-F/I/J,
// the family-law Inventory & Appraisement, and the estate funding list — plus
// gap detection and a few cross-inferences (a mortgage implies a home, income
// implies expenses).
//
// IMPORTANT (product principle): gaps are *suggestions that help*, never
// blockers. The app always lets the client keep going and routes them toward a
// consult or getting their instruments drafted, hedging on facts where needed.
//
// Pure + testable. General information, not legal advice.

import type { FinancialCategory, FinancialItem } from "./types.ts";
import { looksLikeFamilyMatter } from "./family-instruments.ts";
import { looksLikeEstateMatter } from "./estate-instruments.ts";

export type FinancialMatterArea = "bankruptcy" | "family" | "estate" | "general";

const BANKRUPTCY_RE =
  /\b(bankrupt|chapter 7|chapter 13|means test|discharge|creditor|foreclosur|repossess|garnish|insolven|debt relief)\b/i;

/** Best-effort area classification from a matter's subtype/summary text. */
export function detectFinancialArea(text: string | null | undefined): FinancialMatterArea {
  const t = (text ?? "").toLowerCase();
  if (BANKRUPTCY_RE.test(t)) return "bankruptcy";
  if (looksLikeFamilyMatter(t)) return "family";
  if (looksLikeEstateMatter(t)) return "estate";
  return "general";
}

export interface ScheduleBucket {
  key: string;
  label: string;
  /** A short prompt shown when the bucket is empty. */
  hint: string;
  /** Categories that satisfy this bucket. */
  categories: FinancialCategory[];
  /** Required buckets surface as higher-priority gaps (still never blocking). */
  required: boolean;
}

const ASSET_CORE: ScheduleBucket[] = [
  { key: "real_property", label: "Real estate", hint: "Your home or any land you own.", categories: ["real_property"], required: false },
  { key: "vehicles", label: "Vehicles", hint: "Cars, trucks, boats, trailers.", categories: ["vehicle"], required: false },
  { key: "accounts", label: "Bank & investment accounts", hint: "Checking, savings, brokerage.", categories: ["financial_account"], required: false },
  { key: "retirement", label: "Retirement accounts", hint: "401(k), IRA, pension — note beneficiaries.", categories: ["retirement_account"], required: false },
  { key: "business", label: "Business interests", hint: "Any business you own a share of.", categories: ["business_interest"], required: false },
  { key: "personal_property", label: "Personal property of value", hint: "Jewelry, collections, equipment.", categories: ["personal_property"], required: false },
];

const SCHEDULES: Record<FinancialMatterArea, ScheduleBucket[]> = {
  bankruptcy: [
    { ...ASSET_CORE[0], required: true },
    ASSET_CORE[1],
    { ...ASSET_CORE[2], required: true },
    { ...ASSET_CORE[3], required: true },
    ASSET_CORE[4],
    ASSET_CORE[5],
    { key: "secured_debt", label: "Secured debts (Schedule D)", hint: "Mortgages, car loans — debts tied to property.", categories: ["secured_debt"], required: true },
    { key: "unsecured_debt", label: "Unsecured debts (Schedules E/F)", hint: "Credit cards, medical bills, personal loans.", categories: ["unsecured_debt"], required: true },
    { key: "income", label: "Income (Schedule I)", hint: "All sources of monthly income.", categories: ["income_source"], required: true },
    { key: "expenses", label: "Expenses (Schedule J)", hint: "Your monthly living expenses.", categories: ["recurring_expense"], required: true },
  ],
  family: [
    { ...ASSET_CORE[0], required: true },
    ASSET_CORE[1],
    { ...ASSET_CORE[2], required: true },
    { ...ASSET_CORE[3], required: true },
    ASSET_CORE[4],
    ASSET_CORE[5],
    { key: "debts", label: "Debts", hint: "Mortgages, loans, cards — community and separate.", categories: ["secured_debt", "unsecured_debt"], required: true },
    { key: "income", label: "Income", hint: "Each spouse's income sources.", categories: ["income_source"], required: false },
  ],
  estate: [
    { ...ASSET_CORE[0], required: true },
    ASSET_CORE[1],
    { ...ASSET_CORE[2], required: true },
    { key: "retirement", label: "Retirement & insurance (beneficiaries)", hint: "Confirm beneficiary designations are current.", categories: ["retirement_account", "life_insurance"], required: true },
    ASSET_CORE[4],
    ASSET_CORE[5],
  ],
  general: [
    ASSET_CORE[0],
    ASSET_CORE[1],
    ASSET_CORE[2],
    ASSET_CORE[3],
    { key: "debts", label: "Debts", hint: "Anything you owe.", categories: ["secured_debt", "unsecured_debt"], required: false },
    { key: "income", label: "Income", hint: "Your income sources.", categories: ["income_source"], required: false },
  ],
};

export function scheduleForArea(area: FinancialMatterArea): ScheduleBucket[] {
  return SCHEDULES[area];
}

export interface ScheduleGap extends ScheduleBucket {
  /** Suggested category to pre-fill when the user acts on the gap. */
  suggestCategory: FinancialCategory;
}

export interface GapReport {
  area: FinancialMatterArea;
  gaps: ScheduleGap[];
  inferences: { message: string }[];
  /** Required buckets covered / total required — progress, not a gate. */
  requiredCovered: number;
  requiredTotal: number;
}

function hasCategory(items: FinancialItem[], cats: FinancialCategory[]): boolean {
  return items.some((it) => it.status === "active" && cats.includes(it.category));
}

/**
 * Compute which expected buckets are still empty (gaps) and a few cross-
 * inferences. Required gaps sort first. This is advisory only.
 */
export function detectGaps(area: FinancialMatterArea, items: FinancialItem[]): GapReport {
  const schedule = scheduleForArea(area);
  const active = items.filter((it) => it.status === "active");

  const gaps: ScheduleGap[] = schedule
    .filter((b) => !hasCategory(active, b.categories))
    .map((b) => ({ ...b, suggestCategory: b.categories[0] }))
    .sort((a, b) => Number(b.required) - Number(a.required));

  const requiredBuckets = schedule.filter((b) => b.required);
  const requiredCovered = requiredBuckets.filter((b) => hasCategory(active, b.categories)).length;

  // Cross-inferences — cheap, high-signal consistency nudges.
  const inferences: { message: string }[] = [];
  const has = (c: FinancialCategory) => hasCategory(active, [c]);

  if (has("secured_debt") && !has("real_property") && !has("vehicle")) {
    inferences.push({ message: "You listed a secured debt — is there a home or vehicle it's attached to? Add it so the picture balances." });
  }
  if (has("real_property") && area !== "bankruptcy") {
    const home = active.find((it) => it.category === "real_property");
    if (home && (home.characterization === "mixed_or_unknown")) {
      inferences.push({ message: "Note how and when you acquired the home (and with whose funds) so we can characterize it as community or separate." });
    }
  }
  if (area === "bankruptcy" && has("income_source") && !has("recurring_expense")) {
    inferences.push({ message: "Bankruptcy needs your monthly expenses (Schedule J) too, not just income." });
  }
  if (area === "estate" && has("retirement_account")) {
    inferences.push({ message: "Retirement and insurance pass by beneficiary form, not your will — confirm those designations are current." });
  }

  return { area, gaps, inferences, requiredCovered, requiredTotal: requiredBuckets.length };
}
