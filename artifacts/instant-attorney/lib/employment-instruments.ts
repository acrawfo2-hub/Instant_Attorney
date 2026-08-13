// ── Employment & labor instrument presets ────────────────────────────────────
//
// Both halves of the practice: documents a worker is HANDED and needs reviewed
// (non-compete, severance/release, employer NDA) and documents they need to SEND
// or FILE (an EEOC/TWC charge, a demand, an accommodation request, a wage claim).
// Presets over existing instrument types (no new DocType / DB enum). Mirrors
// lib/debt-instruments.ts.
//
// `relevant_statutes` reference keys in lib/employment-statutes.ts; a cross-check
// test asserts every referenced key resolves.

import type { InstrumentType } from "./types.ts";
import { matchEmploymentStatutesByText, type EmploymentStatuteKey } from "./employment-statutes.ts";

export interface EmploymentInstrument {
  key: string;
  label: string;
  purpose: string;
  engine: InstrumentType;
  recipient_guidance: string;
  required_fields: string[];
  relevant_statutes: EmploymentStatuteKey[];
  default_response_days: number | null;
  /** True for deadline-critical / high-stakes instruments (e.g. an agency charge). */
  high_stakes: boolean;
  triggers: string[];
}

export const EMPLOYMENT_INSTRUMENTS: EmploymentInstrument[] = [
  {
    key: "eeoc_tchra_charge",
    label: "EEOC / TWC Charge of Discrimination",
    purpose:
      "Prepare a charge of discrimination or retaliation to file with the EEOC (and/or the Texas Workforce Commission) — the required first step before a discrimination lawsuit.",
    engine: "complaint_letter",
    recipient_guidance:
      "Filed with the EEOC (and dual-filed with the TWC Civil Rights Division). TIME-CRITICAL — the EEOC deadline in Texas is 300 days, the TWC deadline 180 days, from the discriminatory act.",
    required_fields: [
      "Your name and contact information; employer name, address, and approximate size",
      "The protected basis (race, sex, age, disability, religion, national origin, retaliation)",
      "The adverse actions and their dates",
      "A concise, chronological factual narrative and any comparators/witnesses",
      "Whether you also engaged in protected activity (complaints, requests) and were punished",
    ],
    relevant_statutes: ["title-vii", "tchra", "ada", "adea", "title-vii-retaliation"],
    default_response_days: null,
    high_stakes: true,
    triggers: ["eeoc", "file a charge", "charge of discrimination", "twc complaint", "discrimination complaint"],
  },
  {
    key: "employment_demand_letter",
    label: "Demand Letter to Employer",
    purpose:
      "A pre-suit demand to the employer asserting the claim (discrimination, retaliation, unpaid wages) and seeking a remedy, often to open settlement before filing.",
    engine: "demand_letter",
    recipient_guidance:
      "Address to the employer (and its HR/legal). Keep it factual; assess deadlines first, since a demand does not stop the EEOC/agency clock.",
    required_fields: [
      "Your name and the employer's name and address",
      "The conduct complained of, with dates",
      "The legal basis (kept general) and the remedy sought",
      "A response deadline",
    ],
    relevant_statutes: ["title-vii", "title-vii-retaliation", "flsa"],
    default_response_days: 14,
    high_stakes: false,
    triggers: ["demand letter", "demand to my employer", "settle with my employer", "before I sue"],
  },
  {
    key: "severance_review",
    label: "Severance / Release Agreement Review",
    purpose:
      "Review a severance or separation agreement BEFORE signing — what you're giving up, the consideration, OWBPA timing for age claims, non-disparagement, references, and what's negotiable.",
    engine: "doc_review",
    recipient_guidance:
      "For your eyes before you sign. If you're 40+, you generally have at least 21 days to consider and 7 days to revoke — do not sign on the spot.",
    required_fields: [
      "The full text of the severance/release offered",
      "Your age (40+ triggers OWBPA protections) and how long you were given to decide",
      "What's being offered (pay, benefits continuation, references) vs. what you're waiving",
      "Any non-compete, non-disparagement, or confidentiality terms included",
    ],
    relevant_statutes: ["owbpa-severance", "title-vii"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["severance", "separation agreement", "release to sign", "severance package", "should I sign"],
  },
  {
    key: "severance_counter",
    label: "Severance Counter-Offer / Negotiation Letter",
    purpose:
      "Propose improved severance terms — more pay, benefits continuation, a neutral reference, removal or narrowing of restrictive covenants, or a non-disparagement clause that runs both ways.",
    engine: "general_document",
    recipient_guidance:
      "Address to the employer/HR who made the offer, within the consideration window. Anchor asks to leverage (potential claims, value you provided).",
    required_fields: [
      "Your name and the employer/contact",
      "The current offer and the specific improvements requested",
      "Any leverage (potential claims, knowledge, transition value)",
      "A professional, non-adversarial tone and a response window",
    ],
    relevant_statutes: ["owbpa-severance"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["negotiate severance", "counter offer", "more severance", "improve the offer"],
  },
  {
    key: "noncompete_review",
    label: "Non-Compete / Restrictive-Covenant Review",
    purpose:
      "Review a non-compete, non-solicitation, or confidentiality covenant for Texas enforceability — whether it's ancillary to an enforceable agreement and reasonable in time, area, and scope.",
    engine: "doc_review",
    recipient_guidance:
      "For your assessment before signing or before changing jobs. Texas courts reform overbroad covenants rather than void them, so the practical question is how much is enforceable.",
    required_fields: [
      "The full text of the non-compete / restrictive covenant",
      "Your role and what legitimate interest it claims to protect (trade secrets, goodwill, clients)",
      "The time period, geographic area, and scope of restricted activity",
      "What you received in exchange (the consideration), and your new/target role",
    ],
    relevant_statutes: ["tx-noncompete"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["non-compete", "noncompete", "review my non-compete", "can't work for competitor", "restrictive covenant", "non-solicitation"],
  },
  {
    key: "noncompete_response",
    label: "Response to a Non-Compete Enforcement Threat",
    purpose:
      "Respond to a former employer's cease-and-desist or threat to enforce a non-compete — contesting its enforceability (overbreadth, lack of consideration, no protectable interest) without overreaching.",
    engine: "general_document",
    recipient_guidance:
      "Address to the former employer or its counsel. Measured and factual; preserve your position while leaving room to resolve.",
    required_fields: [
      "Your name and the former employer / their counsel",
      "The covenant at issue and the threat received (with dates)",
      "The grounds you dispute it (overbroad time/area/scope, no consideration, no protectable interest)",
      "Your position and any proposed resolution",
    ],
    relevant_statutes: ["tx-noncompete"],
    default_response_days: 14,
    high_stakes: false,
    triggers: ["cease and desist non-compete", "threatened to enforce", "former employer threatening", "non-compete lawsuit"],
  },
  {
    key: "employer_nda_review",
    label: "Employer NDA / Confidentiality Agreement Review",
    purpose:
      "Review an employer-presented NDA or confidentiality/IP-assignment agreement — what it covers, how long it lasts, IP assignment scope, and whether it improperly restricts lawful activity (e.g., whistleblowing, discussing wages).",
    engine: "doc_review",
    recipient_guidance:
      "For your review before signing. Watch for overbroad IP assignment and clauses that purport to bar protected activity like reporting unlawful conduct or discussing pay.",
    required_fields: [
      "The full text of the NDA / confidentiality / IP agreement",
      "Your role and what information/IP it covers",
      "Its duration and any post-employment restrictions",
      "Any clauses touching wages discussion, whistleblowing, or future work",
    ],
    relevant_statutes: ["nlra-concerted", "tx-noncompete"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["employer nda", "confidentiality agreement", "ip agreement", "sign an nda for work", "non-disclosure from employer"],
  },
  {
    key: "accommodation_request",
    label: "Reasonable Accommodation Request (ADA)",
    purpose:
      "Request a reasonable accommodation for a disability (or a religious accommodation) and trigger the employer's duty to engage in the interactive process.",
    engine: "general_document",
    recipient_guidance:
      "Address to HR/your manager in writing; describe the limitation and the accommodation sought without over-disclosing medical detail. Keep a copy — it's evidence of notice.",
    required_fields: [
      "Your name and role",
      "The work limitation (without unnecessary medical detail)",
      "The specific accommodation requested",
      "A request to engage in the interactive process",
    ],
    relevant_statutes: ["ada"],
    default_response_days: 14,
    high_stakes: false,
    triggers: ["request accommodation", "reasonable accommodation", "ada accommodation", "religious accommodation"],
  },
  {
    key: "wage_claim",
    label: "Wage Claim (Texas Payday Law / FLSA)",
    purpose:
      "Prepare a claim for unpaid wages, final pay, commissions, or overtime — via the free TWC Payday Law process or as the basis for an FLSA action.",
    engine: "complaint_letter",
    recipient_guidance:
      "Filed with the Texas Workforce Commission (Payday Law) for owed wages, or used to support an FLSA overtime claim. The TWC deadline is 180 days from when wages were due.",
    required_fields: [
      "Your name and the employer's name and address",
      "The wages owed (final pay, commissions, overtime) with amounts and dates",
      "Your pay rate and classification (exempt/non-exempt, employee/contractor)",
      "Any pay records, time records, or agreements supporting the amount",
    ],
    relevant_statutes: ["flsa", "texas-payday-law"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["unpaid wages", "unpaid overtime", "final paycheck", "owed commission", "wage claim", "didn't pay me"],
  },
];

export type EmploymentInstrumentKey = (typeof EMPLOYMENT_INSTRUMENTS)[number]["key"];

const BY_KEY = new Map(EMPLOYMENT_INSTRUMENTS.map((i) => [i.key, i]));

export function getEmploymentInstrument(key: string): EmploymentInstrument | undefined {
  return BY_KEY.get(key);
}

export function isKnownEmploymentInstrumentKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact catalog for injection into the intake system prompt. */
export function employmentInstrumentsForPrompt(): string {
  return EMPLOYMENT_INSTRUMENTS.map(
    (i) =>
      `• ${i.key} (drafts via ${i.engine})${i.high_stakes ? " [HIGH-STAKES — deadline-critical, recommend consult]" : ""} — ${i.label}: ${i.purpose}`
  ).join("\n");
}

/** Field-hint text for the drafter, shaped like INSTRUMENT_FIELD_HINTS entries. */
export function employmentInstrumentFieldHint(key: string): string | null {
  const inst = BY_KEY.get(key);
  if (!inst) return null;
  const deadline =
    inst.default_response_days != null
      ? ` Assert a response deadline of about ${inst.default_response_days} days unless the file indicates otherwise.`
      : "";
  return `${inst.label}. ${inst.purpose} Recipient: ${inst.recipient_guidance} Required fields: ${inst.required_fields.join(
    "; "
  )}.${deadline}`;
}

/** Offline keyword fallback: surface instruments whose triggers appear in free text. */
export function matchEmploymentInstrumentsByText(text: string): EmploymentInstrument[] {
  const haystack = text.toLowerCase();
  return EMPLOYMENT_INSTRUMENTS.filter((i) => i.triggers.some((t) => haystack.includes(t.toLowerCase())));
}

// Short, single-concept terms an employment matter is described by, so a terse
// matter_subtype like "wrongful termination" is detected even though the
// instrument/statute triggers are multi-word phrases.
const EMPLOYMENT_CORE_TERMS = [
  "employment",
  "fired",
  "terminated",
  "termination",
  "laid off",
  "layoff",
  "wrongful termination",
  "discrimination",
  "harassment",
  "retaliation",
  "hostile work",
  "non-compete",
  "noncompete",
  "severance",
  "overtime",
  "unpaid wages",
  "fmla",
  "accommodation",
  "demoted",
  "my employer",
  "my boss",
  "at work",
  "workplace",
  "eeoc",
];

/**
 * Whether free text (e.g. a case's matter subtype + summary) looks like an
 * employment/labor matter. Combines core terms with the instrument and statute
 * keyword matchers so both terse subtypes and richer summaries are caught.
 */
export function looksLikeEmploymentMatter(text: string | null | undefined): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  if (EMPLOYMENT_CORE_TERMS.some((t) => haystack.includes(t))) return true;
  if (matchEmploymentInstrumentsByText(haystack).length > 0) return true;
  return matchEmploymentStatutesByText(haystack).length > 0;
}
