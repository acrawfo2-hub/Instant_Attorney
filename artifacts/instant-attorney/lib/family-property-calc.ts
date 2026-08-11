// ── Texas community-property division estimator ──────────────────────────────
//
// Pure, deterministic tooling for the other great middle-class divorce fear:
// "who keeps the house, how do we split the 401(k), am I on the hook for their
// debt?" Texas is a community-property state, so a divorce divides the COMMUNITY
// estate "just and right" (§ 7.001) while each spouse keeps their SEPARATE
// property (§ 3.001). This module characterizes items, nets the community
// estate, and applies a division share so a person can see what each spouse
// walks away with — before paying a retainer.
//
// This is an ESTIMATE and general legal information, not legal advice: a court
// can divide the community estate disproportionately and characterization can be
// genuinely disputed (tracing, commingling, reimbursement). No I/O, no deps,
// fully unit-testable — same discipline as lib/family-support-calc.ts.
//
// Grounding: § 3.001 (separate property), §§ 3.002–3.003 (community + the
// community presumption), § 7.001 (just-and-right division). Official text at
// statutes.capitol.texas.gov governs.

export type Spouse = "a" | "b";

/** How an item was acquired — used to SUGGEST a characterization. */
export type AcquisitionMeans =
  | "before_marriage"
  | "gift"
  | "inheritance"
  | "personal_injury_nonearnings"
  | "during_marriage";

export type Characterization = "community" | "separate";

export interface PropertyItem {
  /** Short label, e.g. "Marital home equity" or "Chase credit card". */
  label: string;
  /** Dollar amount, always positive; sign comes from `kind`. */
  value: number;
  /** Asset adds to an estate; debt subtracts from it. */
  kind: "asset" | "debt";
  /** Community (divided) or separate (retained by its owner). */
  characterization: Characterization;
  /** Required when separate: which spouse it belongs to. Ignored for community. */
  owner?: Spouse;
}

export interface PropertyDivisionInput {
  items: PropertyItem[];
  /** Fraction of the NET COMMUNITY estate awarded to spouse A (0–1). Defaults to
   * 0.5 — the "just and right" starting point. Set higher/lower to model a
   * disproportionate division. */
  communityShareToA?: number;
}

export interface PropertyDivisionEstimate {
  communityAssets: number;
  communityDebts: number;
  /** Community assets − community debts (can be negative). */
  netCommunityEstate: number;
  /** Net separate property retained by each spouse (assets − debts). */
  separateNetA: number;
  separateNetB: number;
  /** Fraction of the community estate awarded to A actually used. */
  communityShareToA: number;
  /** Each spouse's share of the net community estate. */
  communityAwardA: number;
  communityAwardB: number;
  /** Bottom line each spouse walks away with (separate + community award). */
  totalToA: number;
  totalToB: number;
  assumptions: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is an estimate and general legal information, not legal advice. Texas divides the community estate in a manner the court finds 'just and right,' which is often but not always equal; characterizing property as separate vs. community can be disputed and may require tracing. Confirm values, characterization, and your specifics with an attorney.";

/** Round to cents to avoid floating-point noise in displayed totals. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Suggest whether an item is separate or community from how it was acquired,
 * applying the § 3.001 separate-property rules and the § 3.003 community
 * presumption. This is a SUGGESTION to help a lay person bucket their property —
 * the actual characterization can require evidence.
 */
export function suggestCharacterization(means: AcquisitionMeans): {
  characterization: Characterization;
  rationale: string;
} {
  switch (means) {
    case "before_marriage":
      return {
        characterization: "separate",
        rationale: "Property owned or claimed before marriage is separate (§ 3.001).",
      };
    case "gift":
      return {
        characterization: "separate",
        rationale: "A gift to one spouse during marriage is that spouse's separate property (§ 3.001).",
      };
    case "inheritance":
      return {
        characterization: "separate",
        rationale: "Property received by devise or descent (inheritance) is separate (§ 3.001).",
      };
    case "personal_injury_nonearnings":
      return {
        characterization: "separate",
        rationale:
          "Recovery for personal injuries is separate, except any portion for lost earning capacity (§ 3.001).",
      };
    case "during_marriage":
    default:
      return {
        characterization: "community",
        rationale:
          "Property acquired during marriage is presumed community and divided unless proven separate by clear and convincing evidence (§§ 3.002–3.003).",
      };
  }
}

/**
 * Divide a marital estate. Deterministic and side-effect free.
 *
 * Separate items missing an `owner` are treated as community — this is the
 * § 3.003 community presumption (separate character was not established) — and
 * flagged in `assumptions`.
 */
export function dividePropertyEstate(input: PropertyDivisionInput): PropertyDivisionEstimate {
  const items = Array.isArray(input.items) ? input.items : [];
  const assumptions: string[] = [];

  let communityAssets = 0;
  let communityDebts = 0;
  let separateAssetsA = 0;
  let separateDebtsA = 0;
  let separateAssetsB = 0;
  let separateDebtsB = 0;
  let presumedCount = 0;

  for (const raw of items) {
    const value = Number.isFinite(raw?.value) ? Math.max(0, raw.value) : 0;
    if (value === 0) continue;
    const isDebt = raw.kind === "debt";

    // A separate item with no owner can't be assigned — the community
    // presumption applies, so treat it as community.
    let characterization = raw.characterization;
    const owner = raw.owner;
    if (characterization === "separate" && owner !== "a" && owner !== "b") {
      characterization = "community";
      presumedCount++;
    }

    if (characterization === "community") {
      if (isDebt) communityDebts += value;
      else communityAssets += value;
    } else if (owner === "a") {
      if (isDebt) separateDebtsA += value;
      else separateAssetsA += value;
    } else {
      if (isDebt) separateDebtsB += value;
      else separateAssetsB += value;
    }
  }

  if (presumedCount > 0) {
    assumptions.push(
      `${presumedCount} item(s) marked separate without an owner were treated as community under the community presumption (§ 3.003).`
    );
  }

  // Clamp the division share into [0,1]; default to an equal "just and right" split.
  let shareA = input.communityShareToA;
  if (!Number.isFinite(shareA as number)) {
    shareA = 0.5;
  } else {
    shareA = Math.min(1, Math.max(0, shareA as number));
  }
  if (shareA !== 0.5) {
    assumptions.push(
      `Modeled a disproportionate division: ${Math.round(shareA * 100)}% of the community estate to spouse A. The statutory starting point is an equal, 'just and right' division.`
    );
  }

  const netCommunityEstate = round2(communityAssets - communityDebts);
  const separateNetA = round2(separateAssetsA - separateDebtsA);
  const separateNetB = round2(separateAssetsB - separateDebtsB);
  const communityAwardA = round2(netCommunityEstate * shareA);
  const communityAwardB = round2(netCommunityEstate - communityAwardA);

  if (netCommunityEstate < 0) {
    assumptions.push(
      "The community debts exceed the community assets, so the shares divide a net liability."
    );
  }

  return {
    communityAssets: round2(communityAssets),
    communityDebts: round2(communityDebts),
    netCommunityEstate,
    separateNetA,
    separateNetB,
    communityShareToA: shareA,
    communityAwardA,
    communityAwardB,
    totalToA: round2(separateNetA + communityAwardA),
    totalToB: round2(separateNetB + communityAwardB),
    assumptions,
    disclaimer: DISCLAIMER,
  };
}

/** A {label, value} pair for the Living File's dedupe-by-prefix fact writer. */
export interface EstimateFact {
  label: string;
  value: string;
}

/** Stable label so re-running UPDATES the same fact in place. */
export const PROPERTY_DIVISION_FACT_LABEL = "Property division (Texas community-estate estimate)";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Turn an estimate into a confirmed fact for the Living File so a Final Decree's
 * property section seeds from the figures instead of a blank placeholder.
 */
export function propertyDivisionToFact(est: PropertyDivisionEstimate): EstimateFact {
  const split = `${Math.round(est.communityShareToA * 100)}/${Math.round((1 - est.communityShareToA) * 100)}`;
  const value = `Net community estate ${usd(est.netCommunityEstate)} divided ${split} → spouse A ${usd(
    est.communityAwardA
  )}, spouse B ${usd(est.communityAwardB)} (plus separate property: A ${usd(est.separateNetA)}, B ${usd(
    est.separateNetB
  )}). Estimate only, not legal advice; a court may divide the community estate unequally.`;
  return { label: PROPERTY_DIVISION_FACT_LABEL, value };
}

/** One-line human summary for chat/document surfaces. */
export function formatPropertyDivisionEstimate(est: PropertyDivisionEstimate): string {
  return `Estimated division — spouse A walks away with about ${usd(est.totalToA)} and spouse B about ${usd(
    est.totalToB
  )} (net community estate ${usd(est.netCommunityEstate)}, split ${Math.round(
    est.communityShareToA * 100
  )}/${Math.round((1 - est.communityShareToA) * 100)}).`;
}
