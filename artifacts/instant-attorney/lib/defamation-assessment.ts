// ── Defamation case assessment ───────────────────────────────────────────────
//
// The centerpiece for the unrepresented defamation victim: a structured, honest
// walk through the elements of a Texas defamation claim and — just as important —
// the things that quietly defeat it: the one-year deadline, the opinion/truth
// defenses, § 230 platform immunity, and the anti-SLAPP fee-shifting trap. It
// returns an element-by-element read, an overall strength, the warnings, and
// concrete next steps, with links to the relevant statute and the right letter.
//
// Pure data + logic, fully testable. This is general legal information to help a
// person think it through — NOT legal advice or a prediction of outcome.

import type { DefamationStatuteKey } from "./defamation-statutes.ts";
import type { DefamationInstrumentKey } from "./defamation-instruments.ts";

export type StatementType = "fact" | "opinion" | "unsure";
export type PlaintiffStatus = "private" | "public_figure" | "public_official" | "unsure";
export type PerSeCategory = "crime" | "disease" | "business_profession" | "sexual" | "none" | "unsure";

export interface DefamationInput {
  /** Is it a provable statement of fact, or protected opinion? */
  statementType?: StatementType;
  /** Is the statement actually false? */
  isFalse?: boolean;
  /** Was it communicated to at least one other person? */
  publishedToOthers?: boolean;
  /** Does it identify / concern you? */
  aboutYou?: boolean;
  /** Your status — drives the fault standard. */
  plaintiffStatus?: PlaintiffStatus;
  /** Per-se category, if any (damages presumed). */
  perSeCategory?: PerSeCategory;
  /** Does it concern a matter of public concern? (anti-SLAPP / actual-malice trigger) */
  matterOfPublicConcern?: boolean;
  /** Months since it was published (1-year SOL). */
  monthsSincePublished?: number;
  /** Do you know who said it? (false => anonymous / § 230 unmasking) */
  speakerKnown?: boolean;
}

export type ElementStatus = "met" | "not_met" | "unclear" | "concern";

export interface ElementCheck {
  element: string;
  status: ElementStatus;
  note: string;
}

export type Strength = "potentially_viable" | "uphill" | "needs_more_info" | "likely_not";

export interface Warning {
  text: string;
  severe?: boolean;
}

export interface ActionItem {
  step: string;
  why?: string;
  urgent?: boolean;
}

export interface DefamationAssessment {
  elements: ElementCheck[];
  strength: Strength;
  headline: string;
  warnings: Warning[];
  actions: ActionItem[];
  relevant_statutes: DefamationStatuteKey[];
  relevant_instruments: DefamationInstrumentKey[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is a general, plain-English read on the pieces of a Texas defamation claim — not legal advice, and not a prediction of how a court would rule. Defamation turns on specifics and has real risks (notably the one-year deadline and the anti-SLAPP fee rule), so use this to get oriented, then talk to an attorney before you sue.";

const yes = (b: boolean | undefined) => b === true;
const no = (b: boolean | undefined) => b === false;

/**
 * Assess a possible defamation claim. Deterministic and honest about gaps.
 */
export function assessDefamation(input: DefamationInput): DefamationAssessment {
  const elements: ElementCheck[] = [];
  const warnings: Warning[] = [];
  const actions: ActionItem[] = [];
  const statutes = new Set<DefamationStatuteKey>(["tx-libel-elements"]);
  const instruments = new Set<DefamationInstrumentKey>();

  // 1. False statement of FACT (the most common claim-killer: opinion / truth).
  let factElement: ElementStatus;
  if (input.statementType === "opinion") {
    factElement = "not_met";
    elements.push({ element: "A false statement of fact", status: "not_met", note: "Pure opinion is protected — it can't be proven true or false, so it isn't defamation." });
    statutes.add("defamation-defenses");
  } else if (input.statementType === "fact" && yes(input.isFalse)) {
    factElement = "met";
    elements.push({ element: "A false statement of fact", status: "met", note: "A provably false factual statement is the core of a claim." });
  } else if (input.statementType === "fact" && no(input.isFalse)) {
    factElement = "not_met";
    elements.push({ element: "A false statement of fact", status: "not_met", note: "If it's substantially true, truth is a complete defense." });
    statutes.add("defamation-defenses");
  } else {
    factElement = "unclear";
    elements.push({ element: "A false statement of fact", status: "unclear", note: "Decide whether this is a provably false fact or just someone's opinion — that's the threshold question." });
    statutes.add("defamation-defenses");
  }

  // 2. Publication to a third party.
  elements.push(
    yes(input.publishedToOthers)
      ? { element: "Published to someone else", status: "met", note: "It was communicated to at least one other person (a post, review, or statement to others qualifies)." }
      : no(input.publishedToOthers)
        ? { element: "Published to someone else", status: "not_met", note: "If no one else saw or heard it, there's no publication — and no defamation." }
        : { element: "Published to someone else", status: "unclear", note: "Was it seen or heard by anyone besides you and the speaker?" }
  );

  // 3. Of and concerning you.
  elements.push(
    yes(input.aboutYou)
      ? { element: "About you", status: "met", note: "It identifies or reasonably points to you." }
      : no(input.aboutYou)
        ? { element: "About you", status: "not_met", note: "A statement that isn't about you generally can't defame you." }
        : { element: "About you", status: "unclear", note: "Would a reader understand it to be about you specifically?" }
  );

  // 4. Fault standard (status-dependent).
  if (input.plaintiffStatus === "public_figure" || input.plaintiffStatus === "public_official") {
    elements.push({ element: "Fault (your status)", status: "concern", note: "As a public figure/official you must prove 'actual malice' — that the speaker knew it was false or recklessly disregarded the truth. That's a hard standard." });
    statutes.add("actual-malice-public-figure");
    warnings.push({ text: "Public-figure status means you must prove actual malice — a high bar that defeats many claims." });
  } else if (input.plaintiffStatus === "private") {
    elements.push({ element: "Fault (your status)", status: "met", note: "As a private person you generally need only show the speaker was negligent about the truth — a lower bar." });
  } else {
    elements.push({ element: "Fault (your status)", status: "unclear", note: "Whether you're a 'public figure' changes how hard the case is — private individuals have a much easier road." });
  }

  // 5. Damages (per se vs actual).
  if (input.perSeCategory && input.perSeCategory !== "none" && input.perSeCategory !== "unsure") {
    elements.push({ element: "Harm / damages", status: "met", note: "This looks like defamation 'per se' (e.g., a false accusation of a crime, disease, professional, or sexual misconduct), so harm is presumed." });
    statutes.add("tx-defamation-per-se");
  } else if (input.perSeCategory === "none") {
    elements.push({ element: "Harm / damages", status: "unclear", note: "Not a per-se category, so you'd need to show actual harm (lost job, clients, income) — gather that proof." });
  } else {
    elements.push({ element: "Harm / damages", status: "unclear", note: "Note any concrete harm (lost work, clients, opportunities) and whether the statement falls in a per-se category." });
  }

  // ── Cross-cutting warnings ────────────────────────────────────────────────
  // One-year limitations.
  statutes.add("tx-defamation-limitations");
  const months = input.monthsSincePublished;
  if (typeof months === "number" && months > 12) {
    warnings.push({ text: "It's been more than a year since publication — Texas's one-year deadline has likely passed, which can bar the claim entirely.", severe: true });
  } else if (typeof months === "number" && months >= 9) {
    warnings.push({ text: "You're approaching the one-year deadline — act quickly; a suit must be filed within one year of publication.", severe: true });
    actions.push({ step: "Don't delay — the one-year filing deadline is close.", urgent: true });
  } else {
    warnings.push({ text: "Texas gives you only one year from publication to sue — much shorter than most deadlines." });
  }

  // Anti-SLAPP fee-shifting (the trap).
  if (yes(input.matterOfPublicConcern)) {
    statutes.add("tx-tcpa-anti-slapp");
    warnings.push({
      text: "This involves speech on a matter of public concern, so Texas's anti-SLAPP law is in play: if you sue and lose an early motion to dismiss, you may be ordered to pay the OTHER side's attorney's fees. Get advice before filing.",
      severe: true,
    });
  }

  // § 230 / anonymous poster.
  if (no(input.speakerKnown)) {
    statutes.add("us-section-230");
    warnings.push({ text: "If the poster is anonymous, the platform is generally immune (§ 230) — you'd pursue the individual, and identifying them may require a subpoena." });
    actions.push({ step: "Capture everything that could help identify the anonymous poster (usernames, profiles, URLs) before it's deleted." });
  }

  // ── Strength ──────────────────────────────────────────────────────────────
  const timeBarred = typeof months === "number" && months > 12;
  const coreMet = factElement === "met" && yes(input.publishedToOthers) && yes(input.aboutYou);
  const anyUnclear = elements.some((e) => e.status === "unclear");

  let strength: Strength;
  let headline: string;
  if (factElement === "not_met" || timeBarred) {
    strength = "likely_not";
    headline = timeBarred
      ? "This may be time-barred — the one-year deadline appears to have passed."
      : input.statementType === "opinion"
        ? "This looks like protected opinion, which generally isn't defamation."
        : "A key element is missing, so a defamation claim looks unlikely here.";
  } else if (coreMet) {
    const uphill =
      input.plaintiffStatus === "public_figure" ||
      input.plaintiffStatus === "public_official" ||
      yes(input.matterOfPublicConcern);
    strength = uphill ? "uphill" : "potentially_viable";
    headline = uphill
      ? "The core elements may be present, but this is an uphill case — weigh the actual-malice / anti-SLAPP risks before acting."
      : "The core elements of a defamation claim may be present. The next step is a retraction request and preserving evidence — not rushing to court.";
  } else if (anyUnclear) {
    strength = "needs_more_info";
    headline = "A few things are still unclear. Answer the open questions to see whether you have a claim.";
  } else {
    strength = "uphill";
    headline = "Some pieces are present and others are weak — proceed carefully and consider advice.";
  }

  // ── Universal action items (most useful first) ────────────────────────────
  actions.unshift(
    { step: "Preserve the evidence now — screenshot/archive the statement with its URL and date before it can be deleted.", urgent: true },
    { step: "Send a written retraction/correction request (Defamation Mitigation Act) — it can get it taken down and preserves your right to punitive damages.", why: "Often the smartest, lowest-cost first move." }
  );
  if (strength !== "likely_not") {
    instruments.add("preservation_letter");
    instruments.add("retraction_request");
    actions.push({ step: "If it doesn't come down, consider a measured cease-and-desist to the speaker — but keep it factual to avoid provoking an anti-SLAPP motion." });
    instruments.add("cease_and_desist_defamation");
    if (no(input.speakerKnown)) instruments.add("platform_report_request");
  }
  actions.push({ step: "Before filing any lawsuit, get an attorney's read on the anti-SLAPP risk and your damages — small-dollar defamation suits can cost more than they recover." });

  return {
    elements,
    strength,
    headline,
    warnings,
    actions,
    relevant_statutes: Array.from(statutes),
    relevant_instruments: Array.from(instruments),
    disclaimer: DISCLAIMER,
  };
}

/** A {label, value} pair for the Living File's dedupe-by-prefix fact writer. */
export interface EstimateFact {
  label: string;
  value: string;
}

export const DEFAMATION_FACT_LABEL = "Defamation assessment";

const STRENGTH_TEXT: Record<Strength, string> = {
  potentially_viable: "core elements may be present",
  uphill: "an uphill case (actual-malice/anti-SLAPP risk)",
  needs_more_info: "needs more information",
  likely_not: "a claim looks unlikely",
};

/** Seed the Living File with the assessment summary. */
export function defamationToFact(a: DefamationAssessment): EstimateFact {
  const severe = a.warnings.filter((w) => w.severe).length;
  return {
    label: DEFAMATION_FACT_LABEL,
    value: `${STRENGTH_TEXT[a.strength]}${severe ? `; ${severe} key risk/deadline flag(s)` : ""}. General assessment, not legal advice; the one-year deadline and anti-SLAPP fee risk should be confirmed with an attorney.`,
  };
}
