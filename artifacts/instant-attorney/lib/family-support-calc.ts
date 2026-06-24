// ── Texas guideline child-support estimator ──────────────────────────────────
//
// Pure, deterministic implementation of the Texas Family Code child-support
// guidelines (Ch. 154). This is the middle-class differentiator: it turns "how
// much will support be?" into a concrete, explainable number BEFORE anyone pays
// a retainer. It is an ESTIMATE of guideline support — not legal advice, not a
// guarantee, and a court may order a different amount for good cause.
//
// No I/O, no dependencies, no coupling — same testing discipline as the rest of
// lib. Wired into the What-If game and document seeding once Phase 1 lands.
//
// Grounding:
// - § 154.125 — guideline percentages applied to monthly net resources, up to a
//   statutory cap on net resources.
// - § 154.129 — "multiple family adjusted guidelines" when the obligor has other
//   children they are legally obligated to support.
// - The official text at statutes.capitol.texas.gov governs.

/** Standard guideline percentage of net resources by number of children before
 * the court, when the obligor has no other children to support (§ 154.125). */
const STANDARD_GUIDELINE_PCT: Record<number, number> = {
  1: 20,
  2: 25,
  3: 30,
  4: 35,
  5: 40,
  // 6+ children: "not less than" the 5-child amount.
  6: 40,
  7: 40,
};

// Multiple Family Adjusted Guidelines (§ 154.129), as percentages of net
// resources. Rows = number of OTHER children the obligor must support (0–7+),
// columns = number of children BEFORE THE COURT (1–7+). Values are the
// statutory table; the official text governs.
const MULTIPLE_FAMILY_TABLE: Record<number, Record<number, number>> = {
  0: { 1: 20.0, 2: 25.0, 3: 30.0, 4: 35.0, 5: 40.0, 6: 40.0, 7: 40.0 },
  1: { 1: 17.5, 2: 22.5, 3: 27.38, 4: 32.2, 5: 37.33, 6: 37.71, 7: 38.0 },
  2: { 1: 16.0, 2: 20.63, 3: 25.2, 4: 30.33, 5: 35.43, 6: 36.0, 7: 36.44 },
  3: { 1: 14.75, 2: 19.0, 3: 24.0, 4: 29.0, 5: 34.0, 6: 34.67, 7: 35.2 },
  4: { 1: 13.6, 2: 18.33, 3: 23.14, 4: 28.0, 5: 32.89, 6: 33.6, 7: 34.18 },
  5: { 1: 13.33, 2: 17.86, 3: 22.5, 4: 27.22, 5: 32.0, 6: 32.73, 7: 33.33 },
  6: { 1: 13.14, 2: 17.5, 3: 22.0, 4: 26.6, 5: 31.27, 6: 32.0, 7: 32.62 },
  7: { 1: 13.0, 2: 17.22, 3: 21.6, 4: 26.09, 5: 30.67, 6: 31.41, 7: 32.05 },
};

/**
 * Statutory cap on monthly net resources to which the guidelines apply
 * (§ 154.125(a-1)). The Office of the Attorney General adjusts it for inflation
 * every six years; it was $9,200 effective Sept 1, 2019. ALWAYS confirm the
 * current OAG cap — pass `capOverride` to use a different figure.
 */
export const DEFAULT_NET_RESOURCES_CAP = 9200;

export interface ChildSupportInput {
  /** Obligor's monthly net resources (after taxes, union dues, and the child's
   * health/dental insurance), per § 154.061–154.070. */
  netMonthlyResources: number;
  /** Number of children before the court in this suit (must be ≥ 1). */
  childrenBeforeCourt: number;
  /** Other children the obligor has a legal duty to support (default 0). Triggers
   * the § 154.129 multiple-family adjustment when > 0. */
  otherChildren?: number;
  /** Override the statutory net-resources cap (use the current OAG figure). */
  capOverride?: number;
}

export interface ChildSupportEstimate {
  /** Guideline percentage applied (e.g. 20 or 17.5). */
  applicablePercentage: number;
  /** Net resources actually used after applying the cap. */
  cappedNetResources: number;
  /** Estimated monthly guideline support, rounded to cents. */
  monthlyAmount: number;
  /** Whether the cap reduced the net resources used. */
  capApplied: boolean;
  /** The cap figure used in this calculation. */
  capUsed: number;
  /** Whether the multiple-family (§ 154.129) table was used. */
  multipleFamilyAdjusted: boolean;
  /** Plain-language notes about how the number was derived. */
  assumptions: string[];
  /** Required disclaimer — surface this with every estimate. */
  disclaimer: string;
}

const DISCLAIMER =
  "This is an estimate of Texas guideline child support for general information only — not legal advice and not a guarantee. A court can order a different amount for good cause, net resources are defined by statute and may differ from take-home pay, and the net-resources cap is adjusted periodically. Confirm the current figures and your specifics with an attorney.";

/** Clamp a child count into the 1–7 table range (7 stands for "7 or more"). */
function clampToTable(n: number): number {
  if (n < 1) return 1;
  if (n > 7) return 7;
  return n;
}

/**
 * Estimate monthly guideline child support under the Texas Family Code.
 * Deterministic and side-effect free.
 */
export function estimateChildSupport(input: ChildSupportInput): ChildSupportEstimate {
  const { childrenBeforeCourt } = input;
  if (!Number.isFinite(childrenBeforeCourt) || childrenBeforeCourt < 1) {
    throw new RangeError("childrenBeforeCourt must be a number ≥ 1");
  }

  const assumptions: string[] = [];

  // Net resources: never negative; the cap applies to the monthly figure.
  const rawNet = Number.isFinite(input.netMonthlyResources)
    ? Math.max(0, input.netMonthlyResources)
    : 0;
  if (input.netMonthlyResources < 0) {
    assumptions.push("Negative net resources were treated as $0.");
  }

  const capUsed = input.capOverride ?? DEFAULT_NET_RESOURCES_CAP;
  const cappedNetResources = Math.min(rawNet, capUsed);
  const capApplied = rawNet > capUsed;
  if (capApplied) {
    assumptions.push(
      `Net resources exceed the $${capUsed.toLocaleString()} statutory cap; guideline support is calculated on the cap. A court may order more for proven needs of the child.`
    );
  }

  const otherChildren = Math.max(0, Math.floor(input.otherChildren ?? 0));
  const multipleFamilyAdjusted = otherChildren > 0;

  const colKids = clampToTable(Math.floor(childrenBeforeCourt));
  let applicablePercentage: number;
  if (multipleFamilyAdjusted) {
    const row = MULTIPLE_FAMILY_TABLE[Math.min(otherChildren, 7)];
    applicablePercentage = row[colKids];
    assumptions.push(
      `Applied the multiple-family adjusted guideline (§ 154.129) for ${otherChildren} other child(ren) the obligor supports.`
    );
  } else {
    applicablePercentage = STANDARD_GUIDELINE_PCT[colKids];
  }

  if (Math.floor(childrenBeforeCourt) > 7) {
    assumptions.push(
      "For more than 7 children before the court, the law requires at least the 5-child guideline; the 7-column figure was used as a floor."
    );
  }

  const monthlyAmount = Math.round(cappedNetResources * (applicablePercentage / 100) * 100) / 100;

  return {
    applicablePercentage,
    cappedNetResources,
    monthlyAmount,
    capApplied,
    capUsed,
    multipleFamilyAdjusted,
    assumptions,
    disclaimer: DISCLAIMER,
  };
}

/**
 * One-line human summary of an estimate, for chat/document surfaces.
 */
export function formatChildSupportEstimate(est: ChildSupportEstimate): string {
  const amt = est.monthlyAmount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  return `Estimated Texas guideline child support: about ${amt}/month (${est.applicablePercentage}% of ${est.cappedNetResources.toLocaleString(
    "en-US",
    { style: "currency", currency: "USD" }
  )} in net resources${est.multipleFamilyAdjusted ? ", multiple-family adjusted" : ""}).`;
}
