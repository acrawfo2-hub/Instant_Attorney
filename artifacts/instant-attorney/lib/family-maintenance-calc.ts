// ── Texas spousal-maintenance eligibility screen ─────────────────────────────
//
// Spousal maintenance is narrow in Texas, which is exactly why a clear, honest
// screen helps a middle-class spouse set expectations before paying a retainer.
// This module applies the Chapter 8 framework: the threshold (the spouse seeking
// maintenance lacks sufficient property/income to meet minimum reasonable needs),
// the eligibility grounds (§ 8.051), the duration limits keyed to marriage length
// and ground (§ 8.054), and the amount cap (§ 8.055). It also surfaces the § 8.053
// rebuttable presumption against maintenance on the 10-year ground.
//
// Pure, deterministic, no I/O. This is general legal information and an estimate
// of the statutory framework — not legal advice or a prediction of what a court
// will do. Official text at statutes.capitol.texas.gov governs.

export interface MaintenanceInput {
  /** Length of the marriage in years. */
  marriageYears: number;
  /** The spouse seeking maintenance lacks sufficient property/income to meet
   * their minimum reasonable needs. This is the gateway threshold for every
   * ground; if false, none of the grounds qualify. */
  lacksMinimumNeeds: boolean;
  /** The other spouse was convicted of / received deferred adjudication for
   * family violence within the statutory window. */
  familyViolence?: boolean;
  /** The seeking spouse cannot earn sufficient income due to an incapacitating
   * physical or mental disability. */
  seekingSpouseDisability?: boolean;
  /** The seeking spouse is the custodian of a child of the marriage who needs
   * substantial care due to a disability, preventing sufficient earning. */
  childWithDisabilityCare?: boolean;
  /** Payor's average monthly gross income, used to compute the § 8.055 cap. */
  payorAverageMonthlyGrossIncome?: number;
}

export interface MaintenanceScreen {
  eligible: boolean;
  /** Plain-language grounds that are met (§ 8.051). */
  grounds: string[];
  /** Longest maintenance period the law generally allows, in years; null when a
   * disability/child-care ground makes it open-ended (subject to review). */
  likelyMaxDurationYears: number | null;
  durationNote: string;
  /** The § 8.055 monthly cap (lesser of $5,000 or 20% of gross), or null if no
   * income was provided. */
  amountCapMonthly: number | null;
  amountNote: string;
  /** § 8.053 presumption note when the only ground is the 10-year ground. */
  presumptionNote: string | null;
  assumptions: string[];
  disclaimer: string;
}

/** § 8.055 absolute monthly ceiling. */
export const MAINTENANCE_ABSOLUTE_CAP = 5000;
/** § 8.055 percentage-of-gross ceiling. */
export const MAINTENANCE_GROSS_PCT = 0.2;

const DISCLAIMER =
  "This is a screen of the Texas spousal-maintenance framework for general information — not legal advice or a prediction. Eligibility, amount, and duration turn on detailed facts and the court's discretion; 'minimum reasonable needs' is a legal standard, not a household budget. Confirm your situation with an attorney.";

/** Duration ceiling keyed to marriage length for the 10-year ground (§ 8.054). */
function durationForMarriageLength(years: number): number | null {
  if (years >= 30) return 10;
  if (years >= 20) return 7;
  if (years >= 10) return 5;
  return null; // under 10 years does not qualify on the length ground
}

/**
 * Screen a spouse's eligibility for Texas spousal maintenance. Deterministic.
 */
export function screenMaintenance(input: MaintenanceInput): MaintenanceScreen {
  const assumptions: string[] = [];
  const years = Number.isFinite(input.marriageYears) ? Math.max(0, input.marriageYears) : 0;
  const lacksNeeds = Boolean(input.lacksMinimumNeeds);

  const familyViolence = Boolean(input.familyViolence);
  const disability = Boolean(input.seekingSpouseDisability);
  const childCare = Boolean(input.childWithDisabilityCare);
  const lengthGround = years >= 10;

  const grounds: string[] = [];
  if (lacksNeeds) {
    if (familyViolence)
      grounds.push("The other spouse committed family violence within the statutory window (§ 8.051).");
    if (lengthGround)
      grounds.push("The marriage lasted 10 years or longer and the seeking spouse cannot meet minimum reasonable needs (§ 8.051).");
    if (disability)
      grounds.push("The seeking spouse has an incapacitating physical or mental disability (§ 8.051).");
    if (childCare)
      grounds.push("The seeking spouse cares for a child of the marriage with a disability requiring substantial care (§ 8.051).");
  }

  const eligible = grounds.length > 0;

  if (!lacksNeeds) {
    assumptions.push(
      "Threshold not met: maintenance requires that the seeking spouse lack sufficient property/income for minimum reasonable needs. Without that, none of the grounds qualify."
    );
  } else if (!eligible) {
    assumptions.push(
      "No qualifying ground: a marriage under 10 years generally qualifies only through family violence, a disability, or caring for a disabled child."
    );
  }

  // Duration: the longest permissible across the grounds that apply.
  let likelyMaxDurationYears: number | null = null;
  let durationNote = "";
  if (eligible) {
    const candidates: number[] = [];
    if (familyViolence) candidates.push(5); // up to 5 years regardless of length
    const lengthDuration = durationForMarriageLength(years);
    if (lengthGround && lengthDuration != null) candidates.push(lengthDuration);
    const numericMax = candidates.length ? Math.max(...candidates) : null;

    if (disability || childCare) {
      // Open-ended while the condition persists, subject to periodic review.
      likelyMaxDurationYears = null;
      durationNote =
        "On a disability or disabled-child-care ground, maintenance may continue as long as the condition persists, subject to the court's periodic review (§ 8.054)." +
        (numericMax != null ? ` Other grounds here would otherwise cap at about ${numericMax} years.` : "");
    } else if (numericMax != null) {
      likelyMaxDurationYears = numericMax;
      durationNote = `The court generally may order maintenance for up to about ${numericMax} years given the marriage length and ground (§ 8.054). Courts are directed to order the shortest reasonable period.`;
    } else {
      durationNote = "Duration depends on the specific ground and facts (§ 8.054).";
    }
  } else {
    durationNote = "Not reached unless the spouse is eligible.";
  }

  // Amount cap (§ 8.055): lesser of $5,000 or 20% of payor's average monthly gross.
  let amountCapMonthly: number | null = null;
  let amountNote =
    "If ordered, monthly maintenance is capped at the lesser of $5,000 or 20% of the payor's average monthly gross income (§ 8.055).";
  const gross = input.payorAverageMonthlyGrossIncome;
  if (gross != null && Number.isFinite(gross) && gross > 0) {
    const pctCap = Math.round(gross * MAINTENANCE_GROSS_PCT * 100) / 100;
    amountCapMonthly = Math.min(MAINTENANCE_ABSOLUTE_CAP, pctCap);
    amountNote = `Capped at ${amountCapMonthly.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    })}/month — the lesser of $5,000 or 20% of the payor's average monthly gross income (§ 8.055).`;
  }

  // § 8.053 presumption applies when the ONLY ground is the 10-year length ground.
  let presumptionNote: string | null = null;
  if (eligible && lengthGround && !familyViolence && !disability && !childCare) {
    presumptionNote =
      "On the 10-year ground there is a rebuttable presumption that maintenance is NOT warranted unless the seeking spouse has diligently tried to earn sufficient income or develop the skills to do so during separation and while the suit is pending (§ 8.053).";
  }

  return {
    eligible,
    grounds,
    likelyMaxDurationYears,
    durationNote,
    amountCapMonthly,
    amountNote,
    presumptionNote,
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
export const MAINTENANCE_FACT_LABEL = "Spousal maintenance (Texas Chapter 8 screen)";

/** Turn a screen into a confirmed fact so a decree's maintenance terms seed from it. */
export function maintenanceScreenToFact(est: MaintenanceScreen): EstimateFact {
  if (!est.eligible) {
    return {
      label: MAINTENANCE_FACT_LABEL,
      value: "Screen indicates the seeking spouse likely does NOT qualify for court-ordered maintenance under Chapter 8. General information, not legal advice.",
    };
  }
  const duration =
    est.likelyMaxDurationYears != null
      ? `up to about ${est.likelyMaxDurationYears} years`
      : "open-ended subject to review (disability/child-care ground)";
  const cap =
    est.amountCapMonthly != null
      ? est.amountCapMonthly.toLocaleString("en-US", { style: "currency", currency: "USD" }) + "/month cap"
      : "capped at the lesser of $5,000 or 20% of payor gross";
  return {
    label: MAINTENANCE_FACT_LABEL,
    value: `Likely eligible for maintenance — ${duration}, ${cap} (§§ 8.051–8.055). Estimate of the framework, not legal advice; the court decides amount and duration.`,
  };
}

/** One-line human summary for chat/document surfaces. */
export function formatMaintenanceScreen(est: MaintenanceScreen): string {
  if (!est.eligible) {
    return "Spousal maintenance screen: likely not eligible under Texas Chapter 8 on the facts given.";
  }
  const duration =
    est.likelyMaxDurationYears != null ? `up to ~${est.likelyMaxDurationYears} yrs` : "open-ended (review)";
  return `Spousal maintenance screen: likely eligible — ${duration}, ${est.amountNote}`;
}
