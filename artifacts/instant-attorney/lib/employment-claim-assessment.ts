// ── Employment claim assessment — claim type → forum → DEADLINE ──────────────
//
// The single most valuable thing the app can do for a worker who was fired or
// mistreated: tell them what KIND of claim they may have, WHERE it's filed, and —
// above all — the DEADLINE, because EEOC/TWC windows are short and a missed one
// ends an otherwise-strong case. It also tells the honest truth about Texas
// at-will employment: "unfair" is not the same as "unlawful."
//
// Pure data + logic, fully testable. General legal information to help a person
// orient and act in time — NOT legal advice or a prediction of outcome.

import type { EmploymentStatuteKey } from "./employment-statutes.ts";
import type { EmploymentInstrumentKey } from "./employment-instruments.ts";

export type AdverseAction =
  | "fired"
  | "demoted"
  | "pay_cut"
  | "not_hired"
  | "harassment"
  | "denied_leave"
  | "denied_accommodation"
  | "unpaid"
  | "other"
  | "none";

export type ProtectedClass =
  | "race"
  | "color"
  | "religion"
  | "sex"
  | "pregnancy"
  | "national_origin"
  | "age_40_plus"
  | "disability"
  | "genetic"
  | "none"
  | "unsure";

export type EmployerSize = "1-14" | "15-19" | "20-49" | "50-99" | "100-plus" | "unsure";

export interface ClaimInput {
  adverseAction?: AdverseAction;
  protectedClass?: ProtectedClass;
  /** Punished after protected activity (complaining, reporting, requesting). */
  retaliation?: boolean;
  /** Fired for refusing to do something illegal (Sabine Pilot). */
  refusedIllegalAct?: boolean;
  /** Adverse action tied to a workers' comp claim (§ 451). */
  workersComp?: boolean;
  /** Unpaid wages / overtime / final pay. */
  wageIssue?: boolean;
  /** Denied/punished for FMLA-type leave. */
  leaveIssue?: boolean;
  /** Punished for discussing pay/conditions or acting with coworkers (NLRA). */
  concertedActivity?: boolean;
  employerSize?: EmployerSize;
  monthsSinceAction?: number;
}

export type Urgency = "ok" | "soon" | "likely_passed" | "unknown";

export interface PotentialClaim {
  key: string;
  title: string;
  basis: string;
  forum: string;
  deadlineText: string;
  /** Governing deadline in days for urgency math, or null if not date-driven here. */
  deadlineDays: number | null;
  daysRemaining: number | null;
  urgency: Urgency;
  coverageNote?: string;
  relevant_statutes: EmploymentStatuteKey[];
}

export interface Warning {
  text: string;
  severe?: boolean;
}
export interface ActionItem {
  step: string;
  why?: string;
  urgent?: boolean;
}

export interface ClaimAssessment {
  claims: PotentialClaim[];
  atWillNote: string;
  warnings: Warning[];
  actions: ActionItem[];
  relevant_instruments: EmploymentInstrumentKey[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is general legal information to help you identify possible claims and, above all, your deadlines — not legal advice or a prediction of outcome. Deadlines are short and depend on specifics; confirm them and your options with an attorney right away. Texas is an at-will state, so not every unfair firing is unlawful.";

const AT_WILL_NOTE =
  "Texas is an at-will state: your employer can generally fire you for almost any reason — even an unfair one — UNLESS the reason is illegal (discrimination, retaliation, refusing to break the law, and a few others). The whole question is whether an unlawful reason was involved.";

const DAYS_PER_MONTH = 30.44;
const EEOC_DAYS = 300; // Texas is a deferral state
const TWC_DAYS = 180;

function realClass(c: ProtectedClass | undefined): c is Exclude<ProtectedClass, "none" | "unsure"> {
  return !!c && c !== "none" && c !== "unsure";
}

function urgencyFor(deadlineDays: number | null, daysSince: number | null): { urgency: Urgency; daysRemaining: number | null } {
  if (deadlineDays == null || daysSince == null) return { urgency: "unknown", daysRemaining: null };
  const daysRemaining = Math.round(deadlineDays - daysSince);
  if (daysRemaining < 0) return { urgency: "likely_passed", daysRemaining };
  if (daysRemaining <= 60) return { urgency: "soon", daysRemaining };
  return { urgency: "ok", daysRemaining };
}

// Minimum employee counts for coverage.
function coverageNote(input: ClaimInput, minEmployees: number): string | undefined {
  const size = input.employerSize;
  if (!size || size === "unsure") return undefined;
  const low = { "1-14": 14, "15-19": 19, "20-49": 49, "50-99": 99, "100-plus": Infinity }[size];
  if (low < minEmployees) {
    return `This law generally applies to employers with ${minEmployees}+ employees; yours may be too small to be covered — though a state or local rule might still reach it.`;
  }
  return undefined;
}

/**
 * Assess possible employment claims with forum and deadline. Deterministic.
 */
export function assessEmploymentClaim(input: ClaimInput): ClaimAssessment {
  const claims: PotentialClaim[] = [];
  const warnings: Warning[] = [];
  const actions: ActionItem[] = [];
  const instruments = new Set<EmploymentInstrumentKey>();

  const daysSince = typeof input.monthsSinceAction === "number" ? Math.round(input.monthsSinceAction * DAYS_PER_MONTH) : null;

  const discBasis = realClass(input.protectedClass);
  const eeocDeadlineText = "300 days to file an EEOC charge (Texas), or 180 days with the Texas Workforce Commission — whichever you use, the clock runs from the act.";

  // ── Discrimination (EEOC route) ───────────────────────────────────────────
  if (discBasis) {
    const u = urgencyFor(EEOC_DAYS, daysSince);
    if (input.protectedClass === "age_40_plus") {
      claims.push({
        key: "age_discrimination",
        title: "Age discrimination (ADEA / TCHRA)",
        basis: "Adverse treatment because you are 40 or older.",
        forum: "EEOC charge (and/or the Texas Workforce Commission)",
        deadlineText: eeocDeadlineText,
        deadlineDays: EEOC_DAYS,
        ...u,
        coverageNote: coverageNote(input, 20),
        relevant_statutes: ["adea", "tchra"],
      });
    } else if (input.protectedClass === "disability") {
      claims.push({
        key: "disability_discrimination",
        title: "Disability discrimination / failure to accommodate (ADA / TCHRA)",
        basis: "Adverse treatment because of a disability, or denial of a reasonable accommodation.",
        forum: "EEOC charge (and/or the Texas Workforce Commission)",
        deadlineText: eeocDeadlineText,
        deadlineDays: EEOC_DAYS,
        ...u,
        coverageNote: coverageNote(input, 15),
        relevant_statutes: ["ada", "tchra"],
      });
    } else {
      const label =
        input.protectedClass === "genetic"
          ? "Genetic-information discrimination (GINA)"
          : "Discrimination (Title VII / TCHRA)";
      claims.push({
        key: "discrimination",
        title: label,
        basis: `Adverse treatment because of your ${String(input.protectedClass).replace(/_/g, " ")}.`,
        forum: "EEOC charge (and/or the Texas Workforce Commission)",
        deadlineText: eeocDeadlineText,
        deadlineDays: EEOC_DAYS,
        ...u,
        coverageNote: coverageNote(input, 15),
        relevant_statutes: ["title-vii", "tchra"],
      });
    }
    instruments.add("eeoc_tchra_charge");
  }

  // ── Retaliation (often the strongest, stands alone) ───────────────────────
  if (input.retaliation) {
    const u = urgencyFor(EEOC_DAYS, daysSince);
    claims.push({
      key: "retaliation",
      title: "Retaliation (Title VII / TCHRA)",
      basis: "Punished after protected activity — complaining about discrimination/harassment, filing a charge, or requesting an accommodation.",
      forum: "EEOC charge (and/or the Texas Workforce Commission)",
      deadlineText: eeocDeadlineText,
      deadlineDays: EEOC_DAYS,
      ...u,
      coverageNote: coverageNote(input, 15),
      relevant_statutes: ["title-vii-retaliation"],
    });
    instruments.add("eeoc_tchra_charge");
  }

  // ── Wage / hour ───────────────────────────────────────────────────────────
  if (input.wageIssue || input.adverseAction === "unpaid") {
    claims.push({
      key: "wage_hour",
      title: "Unpaid wages / overtime (FLSA & Texas Payday Law)",
      basis: "Unpaid overtime, off-the-clock work, misclassification, or owed final pay/commissions.",
      forum: "Free TWC Payday Law claim, the U.S. DOL Wage & Hour Division, or court (FLSA)",
      deadlineText: "TWC Payday Law: 180 days from when wages were due. FLSA in court: 2 years (3 if willful).",
      deadlineDays: TWC_DAYS,
      ...urgencyFor(TWC_DAYS, daysSince),
      relevant_statutes: ["flsa", "texas-payday-law"],
    });
    instruments.add("wage_claim");
  }

  // ── FMLA leave ────────────────────────────────────────────────────────────
  if (input.leaveIssue || input.adverseAction === "denied_leave") {
    claims.push({
      key: "fmla",
      title: "Family & medical leave interference/retaliation (FMLA)",
      basis: "Denied job-protected leave you were entitled to, or punished for taking it.",
      forum: "U.S. DOL Wage & Hour Division, or court",
      deadlineText: "Sue within 2 years (3 if willful).",
      deadlineDays: 730,
      ...urgencyFor(730, daysSince),
      coverageNote: coverageNote(input, 50),
      relevant_statutes: ["fmla"],
    });
  }

  // ── Sabine Pilot (refused illegal act) ────────────────────────────────────
  if (input.refusedIllegalAct) {
    claims.push({
      key: "sabine_pilot",
      title: "Wrongful discharge for refusing an illegal act (Sabine Pilot)",
      basis: "Fired solely because you refused to perform an illegal act carrying criminal penalties.",
      forum: "Texas court (no agency charge required)",
      deadlineText: "Generally a 2-year limitations period — confirm promptly.",
      deadlineDays: 730,
      ...urgencyFor(730, daysSince),
      relevant_statutes: ["sabine-pilot"],
    });
  }

  // ── Workers' comp retaliation ─────────────────────────────────────────────
  if (input.workersComp) {
    claims.push({
      key: "workers_comp_retaliation",
      title: "Workers' compensation retaliation (§ 451)",
      basis: "Fired or punished for filing or pursuing a workers' comp claim in good faith.",
      forum: "Texas court",
      deadlineText: "Generally a 2-year limitations period.",
      deadlineDays: 730,
      ...urgencyFor(730, daysSince),
      relevant_statutes: ["workers-comp-retaliation"],
    });
  }

  // ── Concerted activity (NLRA) ─────────────────────────────────────────────
  if (input.concertedActivity) {
    claims.push({
      key: "concerted_activity",
      title: "Protected concerted activity (NLRA)",
      basis: "Punished for discussing pay/conditions or acting together with coworkers — protected even without a union.",
      forum: "Unfair labor practice charge with the NLRB",
      deadlineText: "File with the NLRB within 6 months.",
      deadlineDays: 180,
      ...urgencyFor(180, daysSince),
      relevant_statutes: ["nlra-concerted"],
    });
  }

  // ── Accommodation request (no adverse action yet) ─────────────────────────
  if (input.adverseAction === "denied_accommodation" && !discBasis) {
    instruments.add("accommodation_request");
  }

  // ── Cross-cutting warnings ────────────────────────────────────────────────
  const anyPassed = claims.some((c) => c.urgency === "likely_passed");
  const anySoon = claims.some((c) => c.urgency === "soon");
  if (anyPassed) {
    warnings.push({ text: "At least one deadline may already have passed. Some windows are short (the TWC is only 180 days), so confirm immediately — a late filing can end the claim.", severe: true });
  }
  if (anySoon) {
    warnings.push({ text: "A filing deadline is close. Don't wait — file or get advice now.", severe: true });
    actions.push({ step: "A deadline is approaching — preserve the claim by filing in time.", urgent: true });
  }
  if (!anyPassed && !anySoon && claims.length > 0) {
    warnings.push({ text: "Employment deadlines are short and unforgiving (often 180–300 days). Calendar them now and don't rely on the longest one." });
  }
  for (const c of claims) {
    if (c.coverageNote) warnings.push({ text: `${c.title}: ${c.coverageNote}` });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  actions.unshift({
    step: "Preserve everything now — save emails, texts, reviews, your handbook, pay records, and write a dated timeline while it's fresh.",
    why: "Employment cases are won on contemporaneous evidence.",
    urgent: true,
  });
  if (claims.some((c) => c.relevant_statutes.includes("title-vii") || c.relevant_statutes.includes("title-vii-retaliation") || c.relevant_statutes.includes("ada") || c.relevant_statutes.includes("adea") || c.relevant_statutes.includes("tchra"))) {
    actions.push({ step: "File an EEOC/TWC charge before the deadline — it's the required first step before a discrimination or retaliation lawsuit." });
  }
  actions.push({ step: "Don't sign a severance or release without reviewing what you're giving up — if you're 40+, you generally have at least 21 days and a 7-day right to revoke." });
  if (claims.length === 0) {
    actions.push({ step: "If no illegal reason is apparent, an attorney can still spot claims you might miss — and confirm whether at-will protections apply." });
  }

  return {
    claims,
    atWillNote: AT_WILL_NOTE,
    warnings,
    actions,
    relevant_instruments: Array.from(instruments),
    disclaimer: DISCLAIMER,
  };
}

/** A {label, value} pair for the Living File's dedupe-by-prefix fact writer. */
export interface EstimateFact {
  label: string;
  value: string;
}

export const EMPLOYMENT_CLAIM_FACT_LABEL = "Employment claim assessment";

/** Seed the Living File with the assessment summary (claims + the nearest deadline). */
export function employmentClaimToFact(a: ClaimAssessment): EstimateFact {
  if (a.claims.length === 0) {
    return {
      label: EMPLOYMENT_CLAIM_FACT_LABEL,
      value: "No clear statutory claim identified on the facts given (Texas is at-will). General information, not legal advice — an attorney may still spot a claim.",
    };
  }
  const titles = a.claims.map((c) => c.title).join("; ");
  const severe = a.warnings.filter((w) => w.severe).length;
  return {
    label: EMPLOYMENT_CLAIM_FACT_LABEL,
    value: `Possible claim(s): ${titles}.${severe ? " DEADLINE FLAG raised." : ""} General assessment, not legal advice; confirm the filing deadlines with an attorney immediately.`,
  };
}
