// ── Personal injury statute-of-limitations screener ──────────────────────────
//
// The #1 PI urgency question: "how long do I have to sue?" Texas generally
// gives two years for bodily injury and wrongful death, but medical malpractice
// has a treatment-tied window and a ten-year repose. This module computes a
// best-effort deadline from the incident date and claim type — pure and
// deterministic, no I/O.
//
// VOLATILE DATA: limitations rules change by legislative amendment; the statute
// registry in lib/pi-statutes.ts is the conceptual source. Registered in
// lib/legal-freshness/registry.ts for periodic re-verification.
//
// General legal information, not legal advice.

export type PiClaimType =
  | "general_pi"
  | "auto_accident"
  | "premises"
  | "wrongful_death"
  | "medical_malpractice";

export interface PiSolInput {
  /** ISO date string (YYYY-MM-DD) or Date for the triggering event. */
  incidentDate: string | Date;
  claimType: PiClaimType;
  /** For med mal: date treatment ended (optional — uses incidentDate if omitted). */
  treatmentEndDate?: string | Date | null;
}

export interface PiSolResult {
  claimType: PiClaimType;
  claimLabel: string;
  incidentDate: string;
  /** Primary filing deadline (ISO date). */
  filingDeadline: string;
  /** Days remaining from today (negative = past deadline). */
  daysRemaining: number;
  /** Whether the primary deadline has passed. */
  expired: boolean;
  urgency: "expired" | "critical" | "warning" | "ok";
  statuteCitation: string;
  statuteKey: string;
  /** For med mal: the absolute repose deadline if computable. */
  reposeDeadline: string | null;
  reposeExpired: boolean;
  assumptions: string[];
  guidance: string;
  disclaimer: string;
}

const DISCLAIMER =
  "This is a general limitations screener for Texas personal-injury claims — not legal advice. Accrual dates can differ (discovery rule, minors, government claims, tolling). Medical-malpractice timing is especially fact-specific. Confirm deadlines with a Texas attorney before relying on this date.";

const CLAIM_LABELS: Record<PiClaimType, string> = {
  general_pi: "General personal injury",
  auto_accident: "Auto / motor-vehicle accident",
  premises: "Premises liability (slip-and-fall, etc.)",
  wrongful_death: "Wrongful death",
  medical_malpractice: "Medical malpractice",
};

const STATUTE_BY_TYPE: Record<PiClaimType, { key: string; citation: string; years: number }> = {
  general_pi: { key: "tx-pi-sol-general", citation: "Tex. Civ. Prac. & Rem. Code § 16.003", years: 2 },
  auto_accident: { key: "tx-pi-sol-general", citation: "Tex. Civ. Prac. & Rem. Code § 16.003", years: 2 },
  premises: { key: "tx-pi-sol-general", citation: "Tex. Civ. Prac. & Rem. Code § 16.003", years: 2 },
  wrongful_death: { key: "tx-pi-sol-general", citation: "Tex. Civ. Prac. & Rem. Code § 16.003", years: 2 },
  medical_malpractice: { key: "tx-med-mal-sol", citation: "Tex. Civ. Prac. & Rem. Code § 74.251", years: 2 },
};

const MED_MAL_REPOSE_YEARS = 10;

function parseDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  const parsed = new Date(d + "T12:00:00");
  if (Number.isNaN(parsed.getTime())) throw new RangeError(`Invalid date: ${d}`);
  return parsed;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addYears(d: Date, years: number): Date {
  const out = new Date(d);
  out.setFullYear(out.getFullYear() + years);
  return out;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function urgencyFromDays(days: number, expired: boolean): PiSolResult["urgency"] {
  if (expired) return "expired";
  if (days <= 90) return "critical";
  if (days <= 180) return "warning";
  return "ok";
}

/**
 * Compute a best-effort Texas PI limitations deadline. Deterministic.
 */
export function screenPiSol(input: PiSolInput, asOf: Date = new Date()): PiSolResult {
  const incident = parseDate(input.incidentDate);
  const statute = STATUTE_BY_TYPE[input.claimType];
  const assumptions: string[] = [];

  let accrualDate = incident;
  if (input.claimType === "medical_malpractice") {
    if (input.treatmentEndDate) {
      accrualDate = parseDate(input.treatmentEndDate);
      assumptions.push("Malpractice accrual uses treatment-end date (later of malpractice or end of treatment).");
    } else {
      assumptions.push("No treatment-end date provided — using incident/malpractice date only; actual accrual may be later.");
    }
  } else {
    assumptions.push("Accrual assumed on incident/injury date (standard negligence rule).");
  }

  const filingDeadlineDate = addYears(accrualDate, statute.years);
  const filingDeadline = toIsoDate(filingDeadlineDate);
  const daysRemaining = daysBetween(asOf, filingDeadlineDate);
  const expired = daysRemaining < 0;

  let reposeDeadline: string | null = null;
  let reposeExpired = false;
  if (input.claimType === "medical_malpractice") {
    const reposeDate = addYears(incident, MED_MAL_REPOSE_YEARS);
    reposeDeadline = toIsoDate(reposeDate);
    reposeExpired = daysBetween(asOf, reposeDate) < 0;
    assumptions.push(`Ten-year statute of repose runs from the act (${reposeDeadline}).`);
  }

  const urgency = reposeExpired ? "expired" : urgencyFromDays(daysRemaining, expired);

  let guidance: string;
  if (reposeExpired) {
    guidance =
      "The ten-year medical-malpractice repose period appears to have passed. This is a hard outer limit in most cases — consult an attorney immediately to see if any exception applies.";
  } else if (expired) {
    guidance =
      "The computed two-year filing deadline appears to have passed. Some claims may still be viable (tolling, discovery rule, minor plaintiffs) — but do not assume you still have time; speak with an attorney immediately.";
  } else if (daysRemaining <= 90) {
    guidance =
      "You are inside the last 90 days before the computed deadline. Insurers often delay until time runs out — treat this as urgent and consult counsel now.";
  } else if (daysRemaining <= 180) {
    guidance =
      "You have less than six months on this computed deadline. Begin gathering records and evaluating counsel before the insurer runs out the clock.";
  } else {
    guidance =
      "On these facts, you appear to be inside the general two-year window — but evidence fades fast. Document injuries, preserve evidence, and do not give recorded statements to the other insurer without a plan.";
  }

  return {
    claimType: input.claimType,
    claimLabel: CLAIM_LABELS[input.claimType],
    incidentDate: toIsoDate(incident),
    filingDeadline,
    daysRemaining,
    expired,
    urgency,
    statuteCitation: statute.citation,
    statuteKey: statute.key,
    reposeDeadline,
    reposeExpired,
    assumptions,
    guidance,
    disclaimer: DISCLAIMER,
  };
}

export const PI_SOL_FACT_LABEL = "PI limitations screener";

export function piSolToFact(input: PiSolInput, result: PiSolResult): { label: string; value: string } {
  const status = result.expired ? "EXPIRED" : `${result.daysRemaining} days remaining`;
  return {
    label: PI_SOL_FACT_LABEL,
    value: `${result.claimLabel}: filing deadline ${result.filingDeadline} (${status}) per ${result.statuteCitation}`,
  };
}

export function formatPiSol(result: PiSolResult): string {
  const status = result.expired ? "Past deadline" : `${result.daysRemaining} days left`;
  return `${result.claimLabel} — file by ${result.filingDeadline} (${status})`;
}
