// ── Personal injury instrument presets ───────────────────────────────────────
//
// The documents a PI matter actually needs — insurer demand letters, evidence-
// preservation notices, medical-records requests, recorded-statement refusals —
// don't map cleanly onto a generic letter. This catalog defines them as PRESETS
// over the existing instrument types (no new DocType / DB enum). Mirrors
// lib/family-instruments.ts and lib/debt-instruments.ts.

import type { InstrumentType } from "./types.ts";
import { matchPiStatutesByText, type PiStatuteKey } from "./pi-statutes.ts";

export interface PiInstrument {
  key: string;
  label: string;
  purpose: string;
  engine: InstrumentType;
  recipient_guidance: string;
  required_fields: string[];
  relevant_statutes: PiStatuteKey[];
  default_response_days: number | null;
  high_stakes: boolean;
  triggers: string[];
}

export const PI_INSTRUMENTS: PiInstrument[] = [
  {
    key: "insurer_settlement_demand",
    label: "Settlement Demand to Insurer",
    purpose:
      "Present a structured demand to the at-fault party's liability insurer — summarizing fault, injuries, medical treatment, damages categories, and a specific settlement amount with a response deadline.",
    engine: "demand_letter",
    recipient_guidance:
      "Send to the adjuster and claims office for the at-fault party's insurer (copy the insured if appropriate). Use certified mail or email with read receipt; keep proof of mailing.",
    required_fields: [
      "Your name and contact information",
      "Claim number and date of loss",
      "Insured/at-fault party name",
      "Adjuster name and address",
      "Summary of how the incident occurred and why their insured is liable",
      "Itemized damages (medical bills, lost wages, pain and suffering) and total demand amount",
      "Response deadline (typically 30 days)",
    ],
    relevant_statutes: ["tx-pi-sol-general", "tx-pi-comparative-negligence", "tx-auto-minimum-liability"],
    default_response_days: 30,
    high_stakes: false,
    triggers: ["demand letter", "settlement demand", "make a demand", "offer to settle", "send demand"],
  },
  {
    key: "evidence_preservation_letter",
    label: "Evidence Preservation (Spoliation) Letter",
    purpose:
      "Put the opposing party, business, or insurer on notice to preserve all relevant evidence — surveillance video, vehicle EDR/black-box data, maintenance logs, employee statements, and communications — before it is destroyed.",
    engine: "demand_letter",
    recipient_guidance:
      "Send immediately to the property owner, business, trucking company, or insurer involved. Certified mail recommended; send copies to known adjusters and corporate registered agents.",
    required_fields: [
      "Date, time, and location of the incident",
      "Recipient name and address (property owner, company, insurer)",
      "Specific categories of evidence to preserve (video, photos, vehicle data, inspection reports)",
      "Your name and claim reference",
      "Request for written confirmation of preservation",
    ],
    relevant_statutes: ["tx-evidence-preservation"],
    default_response_days: 10,
    high_stakes: true,
    triggers: ["preserve evidence", "surveillance", "spoliation", "deleted video", "black box", "dash cam"],
  },
  {
    key: "medical_records_request",
    label: "Medical Records & Billing Request",
    purpose:
      "Request complete medical records and itemized billing from treating providers to document injuries, causation, and damages for the claim or lawsuit.",
    engine: "general_document",
    recipient_guidance:
      "Send to each hospital, clinic, and physician. HIPAA authorizations are usually required — attach a signed authorization or use the provider's form.",
    required_fields: [
      "Patient name and date of birth",
      "Provider name and medical-records department address",
      "Date range of treatment",
      "Types of records requested (records, imaging, itemized bills)",
      "Signed HIPAA authorization (or offer to provide one)",
      "Delivery address or secure portal instructions",
    ],
    relevant_statutes: ["tx-pi-sol-general"],
    default_response_days: 30,
    high_stakes: false,
    triggers: ["medical records", "hospital records", "billing records", "get my records", "hipaa"],
  },
  {
    key: "recorded_statement_refusal",
    label: "Refusal of Recorded Statement",
    purpose:
      "Decline the insurer's request for a recorded statement while reserving your rights — avoiding traps where offhand comments are used against you — and offer to provide information in writing instead.",
    engine: "general_document",
    recipient_guidance:
      "Send to the adjuster who requested the recorded call. You are generally not required to give a recorded statement to the other party's insurer.",
    required_fields: [
      "Your name, claim number, and date of loss",
      "Adjuster name and insurer",
      "Clear refusal of a recorded statement",
      "Offer to provide factual information in writing",
      "Reservation of all rights",
    ],
    relevant_statutes: ["tx-pi-comparative-negligence"],
    default_response_days: null,
    high_stakes: false,
    triggers: [
      "recorded statement",
      "insurer wants a statement",
      "adjuster called",
      "they want me to record",
      "don't want to give statement",
    ],
  },
  {
    key: "health_insurance_lien_notice",
    label: "Health-Insurance / Subrogation Lien Letter",
    purpose:
      "Notify your health insurer or ERISA plan of the third-party claim and negotiate reduction of any lien against your recovery so you keep more of the settlement.",
    engine: "general_document",
    recipient_guidance:
      "Send to your health insurer's subrogation department after you know a third-party claim exists. Many liens can be negotiated down at settlement.",
    required_fields: [
      "Your name, policy/member number",
      "Date of injury and brief incident description",
      "Third-party insurer and claim number (if known)",
      "Request for itemized lien amount and ERISA/plan documents",
      "Request to discuss lien reduction at settlement",
    ],
    relevant_statutes: ["tx-pi-sol-general"],
    default_response_days: 30,
    high_stakes: false,
    triggers: ["subrogation", "health insurance lien", "medicare lien", "medicaid lien", "lien on settlement"],
  },
  {
    key: "tdi_complaint",
    label: "Complaint to Texas Department of Insurance",
    purpose:
      "File a complaint with the TDI when an insurer unreasonably delays, denies, or lowballs a claim in violation of Texas insurance practices.",
    engine: "complaint_letter",
    recipient_guidance:
      "Submit to the Texas Department of Insurance (tdi.texas.gov) with your policy, denial letter, and chronology of communications.",
    required_fields: [
      "Your name and contact information",
      "Insurer name, policy number, and claim number",
      "Chronological description of the claim handling problem",
      "Documents enclosed (denial letter, correspondence, medical bills)",
      "Relief requested",
    ],
    relevant_statutes: ["tx-auto-minimum-liability", "tx-pip-coverage"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["bad faith", "denied my claim", "unfair claim", "tdi complaint", "insurance complaint"],
  },
  {
    key: "letter_of_representation",
    label: "Letter of Representation to Insurer",
    purpose:
      "Notify the liability insurer that you are represented (or directing communications through counsel) and that all contact must go through you or your attorney — stopping direct adjuster pressure.",
    engine: "general_document",
    recipient_guidance:
      "Send to the adjuster and claims supervisor. Once representation is clear, adjusters should not contact you directly.",
    required_fields: [
      "Your name, date of loss, and claim number",
      "Insurer and adjuster contact",
      "Statement that you are represented / directing communications",
      "Instruction that all future contact go through you or designated counsel",
    ],
    relevant_statutes: ["tx-pi-sol-general"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["attorney representation", "stop calling me", "letter of representation", "hire a lawyer"],
  },
];

export type PiInstrumentKey = (typeof PI_INSTRUMENTS)[number]["key"];

const BY_KEY = new Map(PI_INSTRUMENTS.map((i) => [i.key, i]));

export function getPiInstrument(key: string): PiInstrument | undefined {
  return BY_KEY.get(key);
}

export function isKnownPiInstrumentKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function piInstrumentsForPrompt(): string {
  return PI_INSTRUMENTS.map(
    (i) =>
      `• ${i.key} (drafts via ${i.engine})${i.high_stakes ? " [HIGH-STAKES — time-critical, recommend consult]" : ""} — ${i.label}: ${i.purpose}`
  ).join("\n");
}

export function piInstrumentFieldHint(key: string): string | null {
  const inst = BY_KEY.get(key);
  if (!inst) return null;
  const deadline =
    inst.default_response_days != null
      ? ` Assert / honor a response deadline of about ${inst.default_response_days} days unless the file indicates otherwise.`
      : "";
  return `${inst.label}. ${inst.purpose} Recipient: ${inst.recipient_guidance} Required fields: ${inst.required_fields.join(
    "; "
  )}.${deadline}`;
}

export function matchPiInstrumentsByText(text: string): PiInstrument[] {
  const haystack = text.toLowerCase();
  return PI_INSTRUMENTS.filter((i) => i.triggers.some((t) => haystack.includes(t.toLowerCase())));
}

const PI_CORE_TERMS = [
  "personal injury",
  "car accident",
  "auto accident",
  "car crash",
  "rear ended",
  "rear-ended",
  "slip and fall",
  "trip and fall",
  "premises",
  "injured",
  "injury claim",
  "wrongful death",
  "medical malpractice",
  "med mal",
  "dog bite",
  "truck accident",
  "motorcycle accident",
  "pedestrian hit",
  "hit by a car",
  "insurance adjuster",
  "settlement offer",
  "bodily injury",
];

export function looksLikePersonalInjuryMatter(text: string | null | undefined): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  if (PI_CORE_TERMS.some((t) => haystack.includes(t))) return true;
  if (matchPiInstrumentsByText(haystack).length > 0) return true;
  return matchPiStatutesByText(haystack).length > 0;
}
