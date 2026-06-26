// ── Texas bankruptcy exemptions — "what would I keep?" ───────────────────────
//
// The #2 bankruptcy fear after "can I file?" is "will they take my stuff?" In
// Texas the answer is usually "no" — the exemptions are among the most generous
// in the country. This checker classifies a person's assets as exempt, exempt
// within the aggregate personal-property cap, or potentially at risk, and tells
// them plainly whether they'd likely keep everything. Pure and deterministic.
//
// VOLATILE DATA: the $100k/$50k personal-property cap is statutory (Tex. Prop.
// Code § 42.001) and changes only by amendment; it is registered in the
// legal-freshness registry. General legal information, not legal advice; actual
// exemption outcomes depend on facts, valuation, and liens.

/** Texas aggregate personal-property exemption cap (Tex. Prop. Code § 42.001). */
export const TX_EXEMPTION_CAP = {
  family: 100000,
  single: 50000,
  asOf: "2025-06-01",
  source: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.42.htm",
} as const;

export type AssetCategory =
  | "homestead"
  | "vehicle"
  | "household_goods"
  | "tools_of_trade"
  | "jewelry"
  | "firearms"
  | "retirement"
  | "wages"
  | "life_insurance"
  | "cash_bank"
  | "other_nonexempt";

export interface ExemptionAsset {
  category: AssetCategory;
  value: number;
  label?: string;
}

export type ExemptStatus = "exempt" | "capped" | "at_risk";

export interface AssetResult {
  category: AssetCategory;
  label: string;
  value: number;
  status: ExemptStatus;
  note: string;
}

export interface ExemptionResult {
  isSingle: boolean;
  cap: number;
  capAsOf: string;
  /** Sum of capped-category asset values (jewelry counted only up to its sublimit). */
  cappedEligibleTotal: number;
  cappedExempt: number;
  cappedAtRisk: number;
  assets: AssetResult[];
  totalValue: number;
  totalAtRisk: number;
  keepsEverything: boolean;
  summary: string;
  assumptions: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is an estimate of how Texas exemptions would apply, for general information — not legal advice. Outcomes depend on accurate values, liens, how property is titled, and timing; jewelry is limited to 25% of the aggregate cap, and cash/bank balances are generally not exempt unless traceable to exempt funds (like wages or Social Security). Confirm with an attorney.";

/** Categories that count toward the aggregate personal-property cap. */
const CAPPED: ReadonlySet<AssetCategory> = new Set([
  "vehicle",
  "household_goods",
  "tools_of_trade",
  "jewelry",
  "firearms",
]);
/** Categories exempt independently of the cap. */
const SEPARATELY_EXEMPT: ReadonlySet<AssetCategory> = new Set([
  "homestead",
  "retirement",
  "wages",
  "life_insurance",
]);

const LABELS: Record<AssetCategory, string> = {
  homestead: "Home (homestead)",
  vehicle: "Vehicle",
  household_goods: "Household goods & furnishings",
  tools_of_trade: "Tools of the trade",
  jewelry: "Jewelry",
  firearms: "Firearms",
  retirement: "Retirement account",
  wages: "Current wages",
  life_insurance: "Life insurance",
  cash_bank: "Cash / bank balance",
  other_nonexempt: "Other (investment/second property, etc.)",
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Classify assets against the Texas exemptions. Deterministic.
 */
export function checkExemptions(assets: ExemptionAsset[], isSingle: boolean): ExemptionResult {
  const cap = isSingle ? TX_EXEMPTION_CAP.single : TX_EXEMPTION_CAP.family;
  const jewelrySublimit = cap * 0.25;
  const assumptions: string[] = [];

  const clean = (Array.isArray(assets) ? assets : []).filter(
    (a) => a && Number.isFinite(a.value) && a.value > 0
  );

  // First pass: per-asset status + capped eligible contribution.
  let cappedEligibleTotal = 0;
  let jewelryExcess = 0;
  const results: AssetResult[] = clean.map((a) => {
    const label = a.label?.trim() || LABELS[a.category];
    if (SEPARATELY_EXEMPT.has(a.category)) {
      const note =
        a.category === "homestead"
          ? "Protected with no value cap, subject to Texas acreage limits and any mortgage/liens."
          : "Generally fully exempt, separate from the personal-property cap.";
      return { category: a.category, label, value: a.value, status: "exempt", note };
    }
    if (CAPPED.has(a.category)) {
      let eligible = a.value;
      let note = "Exempt as long as your total covered personal property stays within the cap.";
      if (a.category === "jewelry") {
        eligible = Math.min(a.value, jewelrySublimit);
        if (a.value > jewelrySublimit) {
          jewelryExcess += a.value - jewelrySublimit;
          note = `Jewelry is exempt only up to 25% of the cap (${usd(jewelrySublimit)}); the excess may be at risk.`;
        }
      }
      cappedEligibleTotal += eligible;
      return { category: a.category, label, value: a.value, status: "capped", note };
    }
    // cash_bank / other_nonexempt
    const note =
      a.category === "cash_bank"
        ? "Cash and bank balances are generally NOT exempt in Texas unless traceable to exempt funds (wages, Social Security)."
        : "Likely not exempt — investment or non-essential property a trustee could reach.";
    return { category: a.category, label, value: a.value, status: "at_risk", note };
  });

  const cappedExempt = Math.min(cappedEligibleTotal, cap);
  const cappedOverflow = Math.max(0, cappedEligibleTotal - cap);
  const cappedAtRisk = cappedOverflow + jewelryExcess;
  if (cappedOverflow > 0) {
    assumptions.push(
      `Your covered personal property (${usd(cappedEligibleTotal)}) exceeds the ${usd(cap)} ${isSingle ? "single-adult" : "family"} cap; about ${usd(cappedOverflow)} over the cap may be at risk.`
    );
  }
  if (jewelryExcess > 0) {
    assumptions.push(`Jewelry above 25% of the cap adds about ${usd(jewelryExcess)} of at-risk value.`);
  }

  const atRiskCategories = results
    .filter((r) => r.status === "at_risk")
    .reduce((sum, r) => sum + r.value, 0);
  const totalAtRisk = Math.round((cappedAtRisk + atRiskCategories) * 100) / 100;
  const totalValue = clean.reduce((sum, a) => sum + a.value, 0);
  const keepsEverything = totalAtRisk === 0;

  const summary = keepsEverything
    ? "Based on Texas's generous exemptions, you'd likely keep everything you listed."
    : `Most of your property is protected. About ${usd(totalAtRisk)} may be at risk and is worth discussing with an attorney — there are often ways to protect it.`;

  return {
    isSingle,
    cap,
    capAsOf: TX_EXEMPTION_CAP.asOf,
    cappedEligibleTotal,
    cappedExempt,
    cappedAtRisk,
    assets: results,
    totalValue,
    totalAtRisk,
    keepsEverything,
    summary,
    assumptions,
    disclaimer: DISCLAIMER,
  };
}

/** A {label, value} pair for the Living File's dedupe-by-prefix fact writer. */
export interface EstimateFact {
  label: string;
  value: string;
}

export const EXEMPTIONS_FACT_LABEL = "Texas exemptions (what you'd keep)";

/** Seed the Living File so bankruptcy guidance reflects the exemption picture. */
export function exemptionsToFact(result: ExemptionResult): EstimateFact {
  const verdict = result.keepsEverything
    ? "would likely keep everything listed"
    : `about ${usd(result.totalAtRisk)} may be at risk`;
  return {
    label: EXEMPTIONS_FACT_LABEL,
    value: `Of ${usd(result.totalValue)} in listed assets (${result.isSingle ? "single" : "family"} cap ${usd(
      result.cap
    )}), ${verdict}. Estimate only, not legal advice; depends on values, liens, and titling.`,
  };
}

/** Catalog of asset categories for a UI picker. */
export const ASSET_CATEGORIES: { category: AssetCategory; label: string }[] = (
  Object.keys(LABELS) as AssetCategory[]
).map((category) => ({ category, label: LABELS[category] }));
