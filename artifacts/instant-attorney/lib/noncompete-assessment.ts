// ── Texas non-compete enforceability assessment ──────────────────────────────
//
// People panic when handed a non-compete or threatened with one — but in Texas
// the real question is rarely "is it valid?" and almost always "how much of it
// holds up?", because courts REFORM overbroad covenants instead of voiding them.
// This walks the § 15.50 test honestly: is it ancillary to an otherwise
// enforceable agreement (with consideration that gives rise to a protectable
// interest), and is it reasonable in time, geography, and scope? Then it surfaces
// the negotiation levers.
//
// Pure data + logic, fully testable. General legal information, not legal advice
// or a prediction; enforceability is fact-specific.

import type { EmploymentInstrumentKey } from "./employment-instruments.ts";

export type GeoScope = "reasonable" | "broad" | "none_specified" | "unsure";
export type ActivityScope = "narrow" | "broad" | "unsure";

export interface NoncompeteInput {
  /** Tied to an otherwise enforceable agreement (e.g. you received confidential
   * information, specialized training, or equity in exchange). */
  ancillaryToAgreement?: boolean;
  /** You actually received something giving rise to the employer's interest. */
  receivedConsideration?: boolean;
  /** The employer has a legitimate interest to protect (trade secrets, client
   * goodwill, confidential information). */
  protectableInterest?: boolean;
  /** Restriction length in months. */
  timeMonths?: number;
  /** Geographic reach relative to where you actually worked. */
  geography?: GeoScope;
  /** Scope of restricted activity relative to your actual role. */
  activityScope?: ActivityScope;
}

export type Enforceability = "likely_enforceable" | "overbroad_reformable" | "likely_unenforceable" | "needs_more_info";

export type FactorStatus = "ok" | "concern" | "missing" | "unclear";
export interface Factor {
  factor: string;
  status: FactorStatus;
  note: string;
}
export interface Warning {
  text: string;
  severe?: boolean;
}

export interface NoncompeteAssessment {
  enforceability: Enforceability;
  headline: string;
  factors: Factor[];
  reformationNote: string;
  negotiationLevers: string[];
  warnings: Warning[];
  relevant_statutes: ["tx-noncompete"];
  relevant_instruments: EmploymentInstrumentKey[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is a general read on Texas non-compete enforceability (Tex. Bus. & Com. Code § 15.50), not legal advice or a prediction. Enforceability is highly fact-specific, and Texas courts reform overbroad covenants rather than void them — so even an overbroad one can have some effect. Get an attorney's review before you rely on it or change jobs.";

const REFORMATION_NOTE =
  "Important: in Texas, a court will REFORM an overbroad non-compete to reasonable limits rather than throw it out — so 'overbroad' rarely means 'ignore it.' But there's an upside: an employer generally cannot recover damages for your conduct before reformation, and may be denied its attorney's fees, when the covenant was overbroad as written.";

const NEGOTIATION_LEVERS = [
  "Narrow the geography to the specific area where you actually worked or served clients.",
  "Shorten the term — 6–12 months is far easier to defend than multiple years.",
  "Limit the restricted activity to your actual role, not a whole industry.",
  "Convert a broad non-compete into a narrower non-solicitation of specific clients you served.",
  "Carve out your established specialty or pre-existing relationships.",
  "Ask for pay during any restricted period (garden leave), or a release as part of severance.",
];

const yes = (b: boolean | undefined) => b === true;
const no = (b: boolean | undefined) => b === false;

/**
 * Assess a Texas non-compete's likely enforceability. Deterministic.
 */
export function assessNoncompete(input: NoncompeteInput): NoncompeteAssessment {
  const factors: Factor[] = [];
  const warnings: Warning[] = [];

  // Foundation 1: ancillary to an otherwise enforceable agreement + consideration.
  let foundationMissing = false;
  let foundationUnclear = false;
  if (no(input.ancillaryToAgreement) || no(input.receivedConsideration)) {
    foundationMissing = true;
    factors.push({ factor: "Ancillary to an enforceable agreement", status: "missing", note: "A Texas non-compete must be tied to an otherwise enforceable agreement with real consideration (e.g. a promise to provide confidential information). Without that, it likely fails at the threshold." });
  } else if (yes(input.ancillaryToAgreement) && yes(input.receivedConsideration)) {
    factors.push({ factor: "Ancillary to an enforceable agreement", status: "ok", note: "Tied to an agreement with consideration giving rise to the employer's interest." });
  } else {
    foundationUnclear = true;
    factors.push({ factor: "Ancillary to an enforceable agreement", status: "unclear", note: "Did you receive confidential information, training, or equity in exchange? That's the foundation of enforceability." });
  }

  // Foundation 2: protectable interest.
  if (no(input.protectableInterest)) {
    foundationMissing = true;
    factors.push({ factor: "A legitimate protectable interest", status: "missing", note: "Without a real interest to protect (trade secrets, client goodwill, confidential info), a non-compete generally can't stand." });
  } else if (yes(input.protectableInterest)) {
    factors.push({ factor: "A legitimate protectable interest", status: "ok", note: "There's an interest the restriction can legitimately protect." });
  } else {
    foundationUnclear = true;
    factors.push({ factor: "A legitimate protectable interest", status: "unclear", note: "Identify what the employer is actually protecting — that defines how broad the restriction can be." });
  }

  // Reasonableness: time.
  let anyConcern = false;
  if (typeof input.timeMonths === "number") {
    if (input.timeMonths > 24) {
      anyConcern = true;
      factors.push({ factor: "Reasonable in time", status: "concern", note: `${input.timeMonths} months is on the long side; Texas courts often narrow durations beyond 1–2 years.` });
    } else {
      factors.push({ factor: "Reasonable in time", status: "ok", note: `${input.timeMonths} months is within the range courts commonly accept.` });
    }
  } else {
    factors.push({ factor: "Reasonable in time", status: "unclear", note: "How long does the restriction last? Shorter is far more defensible." });
  }

  // Reasonableness: geography.
  if (input.geography === "reasonable") {
    factors.push({ factor: "Reasonable in geography", status: "ok", note: "Tied to where you actually worked or served clients." });
  } else if (input.geography === "broad" || input.geography === "none_specified") {
    anyConcern = true;
    factors.push({ factor: "Reasonable in geography", status: "concern", note: "A statewide/nationwide reach (or no geographic limit) for a local role is a classic overbreadth problem — though a tightly scoped client restriction can sometimes justify it." });
  } else {
    factors.push({ factor: "Reasonable in geography", status: "unclear", note: "Does the area match where you worked? Broad geography is the most commonly reformed term." });
  }

  // Reasonableness: scope of activity.
  if (input.activityScope === "narrow") {
    factors.push({ factor: "Reasonable in scope", status: "ok", note: "Limited to your actual role/activities, not an entire industry." });
  } else if (input.activityScope === "broad") {
    anyConcern = true;
    factors.push({ factor: "Reasonable in scope", status: "concern", note: "Barring you from a whole industry (rather than your specific role) is usually broader than necessary." });
  } else {
    factors.push({ factor: "Reasonable in scope", status: "unclear", note: "Does it restrict your specific job, or far more? Narrow scope holds up better." });
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  let enforceability: Enforceability;
  let headline: string;
  if (foundationMissing) {
    enforceability = "likely_unenforceable";
    headline = "A foundational requirement appears to be missing, so this non-compete may be unenforceable — but confirm before you rely on it.";
  } else if (foundationUnclear) {
    enforceability = "needs_more_info";
    headline = "The foundation (an enforceable agreement, consideration, and a protectable interest) is unclear — pin that down first; it decides everything.";
  } else if (anyConcern) {
    enforceability = "overbroad_reformable";
    headline = "The foundation looks present but one or more terms look overbroad. A Texas court would likely narrow it rather than void it — so expect a reduced, but real, restriction.";
    warnings.push({ text: "Overbroad doesn't mean void in Texas — courts reform non-competes. Don't assume you can ignore it.", severe: true });
  } else {
    enforceability = "likely_enforceable";
    headline = "The foundation is present and the limits look reasonable, so this non-compete may well be enforceable as written. Plan around it or negotiate.";
  }

  return {
    enforceability,
    headline,
    factors,
    reformationNote: REFORMATION_NOTE,
    negotiationLevers: NEGOTIATION_LEVERS,
    warnings,
    relevant_statutes: ["tx-noncompete"],
    relevant_instruments: ["noncompete_review", "noncompete_response"],
    disclaimer: DISCLAIMER,
  };
}

/** A {label, value} pair for the Living File's dedupe-by-prefix fact writer. */
export interface EstimateFact {
  label: string;
  value: string;
}

export const NONCOMPETE_FACT_LABEL = "Non-compete enforceability (Texas § 15.50)";

const VERDICT_TEXT: Record<Enforceability, string> = {
  likely_enforceable: "likely enforceable as written",
  overbroad_reformable: "likely overbroad — a court would narrow it, not void it",
  likely_unenforceable: "likely unenforceable (a foundational requirement appears missing)",
  needs_more_info: "needs more information on the foundation",
};

export function noncompeteToFact(a: NoncompeteAssessment): EstimateFact {
  return {
    label: NONCOMPETE_FACT_LABEL,
    value: `${VERDICT_TEXT[a.enforceability]}. General assessment under § 15.50, not legal advice; Texas reforms overbroad covenants rather than voiding them — confirm with an attorney before relying on it.`,
  };
}
