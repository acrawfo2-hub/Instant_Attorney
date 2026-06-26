// ── Personal injury claim guide ──────────────────────────────────────────────
//
// Turn "I was hurt and don't know what to do" into RIGHTS, ACTION ITEMS, and
// CAUTIONS an expert PI attorney would surface on day one. Pure data + lookups,
// fully testable; references pi-statutes and pi-instruments so the UI can link
// straight to the relevant right and the letter that asserts it.
//
// General legal information, not legal advice.

import type { PiStatuteKey } from "./pi-statutes.ts";
import type { PiInstrumentKey } from "./pi-instruments.ts";

export type PiSituation =
  | "just_happened"
  | "dealing_with_insurer"
  | "lowball_offer"
  | "denied_claim"
  | "medical_malpractice"
  | "wrongful_death";

export interface ActionItem {
  step: string;
  why?: string;
  urgent?: boolean;
}

export interface ClaimGuidance {
  situation: PiSituation;
  label: string;
  blurb: string;
  rights: string[];
  actions: ActionItem[];
  cautions: string[];
  relevant_statutes: PiStatuteKey[];
  relevant_instruments: PiInstrumentKey[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is general legal information about personal-injury claims in Texas, not legal advice. Deadlines, fault, and the value of a claim depend on your specific facts. Most PI attorneys offer free consultations — and you generally do not pay attorney's fees out of pocket unless you recover (contingency fee).";

const GUIDANCE: Record<PiSituation, Omit<ClaimGuidance, "situation" | "disclaimer">> = {
  just_happened: {
    label: "I was just injured",
    blurb: "The accident or injury happened recently and you're figuring out the first steps.",
    rights: [
      "You generally have two years from the injury to file a lawsuit — but evidence disappears fast, so acting early protects your claim.",
      "The at-fault party's insurer may owe your medical bills, lost wages, pain and suffering, and other damages — but they do not work for you.",
      "You are generally not required to give a recorded statement to the other party's insurance company.",
    ],
    actions: [
      { step: "Get medical treatment and follow every doctor's instruction.", why: "Gaps in treatment are used to argue your injuries aren't serious.", urgent: true },
      { step: "Call police / file an incident report if you haven't already.", why: "An official report is foundational evidence." },
      { step: "Photograph injuries, vehicle/property damage, the scene, and any visible hazards.", urgent: true },
      { step: "Get names and contact info for witnesses.", why: "Witnesses disappear; memories fade." },
      { step: "Notify your own auto insurer (and check for PIP/med-pay coverage).", why: "Your own policy may pay medical bills regardless of fault." },
      { step: "Send an evidence-preservation letter if a business, trucking company, or surveillance cameras were involved.", why: "Video and black-box data are often deleted within days.", urgent: true },
    ],
    cautions: [
      "Do NOT give a recorded statement to the other party's insurer without understanding the risks — offhand comments can be used against you.",
      "Do NOT sign a release or accept a quick check without knowing what you're giving up.",
      "Do NOT post about the accident or your injuries on social media.",
    ],
    relevant_statutes: ["tx-pi-sol-general", "tx-pip-coverage", "tx-evidence-preservation"],
    relevant_instruments: ["evidence_preservation_letter", "recorded_statement_refusal", "medical_records_request"],
  },
  dealing_with_insurer: {
    label: "An insurance adjuster contacted me",
    blurb: "The at-fault party's insurer is calling, asking questions, or requesting documents.",
    rights: [
      "You can communicate in writing instead of giving a recorded phone statement.",
      "You can (and should) document every call — date, adjuster name, and what was said.",
      "Texas uses modified comparative negligence: you can recover if you are 50% or less at fault, reduced by your share.",
    ],
    actions: [
      { step: "Politely decline a recorded statement and offer to provide facts in writing.", why: "Protects you from traps and misquotes." },
      { step: "Keep a call log and save every letter and email.", why: "Bad-faith and lowball patterns are proven with a paper trail." },
      { step: "Gather all medical bills, records, and proof of lost wages before discussing settlement.", why: "You can't evaluate an offer without knowing your damages." },
      { step: "Check whether the at-fault driver has only minimum limits ($30k/$60k) and whether you have UM/UIM coverage.", why: "Minimum policies often can't cover serious injuries." },
    ],
    cautions: [
      "Adjusters are trained to minimize payouts — friendly does not mean on your side.",
      "Do NOT let the adjuster rush you into a settlement while you're still treating.",
      "Do NOT assume the first offer is fair — it rarely is.",
    ],
    relevant_statutes: ["tx-pi-comparative-negligence", "tx-auto-minimum-liability", "tx-pip-coverage"],
    relevant_instruments: ["recorded_statement_refusal", "letter_of_representation", "medical_records_request"],
  },
  lowball_offer: {
    label: "I got a low settlement offer",
    blurb: "The insurer made an offer that doesn't cover your bills or feels unfair.",
    rights: [
      "You are not obligated to accept any offer — you can negotiate or litigate.",
      "Your damages include past and future medical expenses, lost earning capacity, pain and suffering, and disfigurement/disability where applicable.",
      "If fault is disputed, a structured demand letter with evidence often moves the number more than arguing on the phone.",
    ],
    actions: [
      { step: "Add up all medical bills (paid and outstanding) and documented lost wages.", why: "You need a damages floor before countering." },
      { step: "Get a written counter-demand with supporting records.", why: "Numbers in writing change the negotiation." },
      { step: "Consider a free consultation with a PI attorney before signing anything.", why: "Attorneys often increase net recovery even after their fee." },
      { step: "Check for health-insurance liens and plan for subrogation at settlement.", why: "Liens can eat your net recovery if not handled." },
    ],
    cautions: [
      "Do NOT sign a release for a check that doesn't cover future treatment you may need.",
      "Do NOT accept 'full and final' language without understanding every claim you're releasing.",
    ],
    relevant_statutes: ["tx-pi-comparative-negligence", "tx-pi-sol-general"],
    relevant_instruments: ["insurer_settlement_demand", "health_insurance_lien_notice"],
  },
  denied_claim: {
    label: "The insurer denied my claim",
    blurb: "The insurance company refused coverage or says you were at fault.",
    rights: [
      "A denial letter is not the final word — you can challenge it with evidence and, if necessary, a lawsuit.",
      "You can file a complaint with the Texas Department of Insurance for unreasonable claim handling.",
      "Comparative negligence does not automatically bar you unless you are more than 50% at fault.",
    ],
    actions: [
      { step: "Request the denial in writing with the specific policy provisions cited.", urgent: true },
      { step: "Gather evidence contradicting fault — photos, witness statements, police report, expert opinions.", why: "Denials based on 'you were speeding' need facts, not arguments." },
      { step: "File a TDI complaint if the insurer is unreasonably delaying or denying without investigation.", why: "Regulatory pressure sometimes unsticks claims." },
      { step: "Evaluate litigation before the two-year limitations period expires.", urgent: true },
    ],
    cautions: [
      "Do NOT miss the two-year lawsuit deadline while arguing with the adjuster.",
      "Do NOT assume you have no case because the insurer said so.",
    ],
    relevant_statutes: ["tx-pi-sol-general", "tx-pi-comparative-negligence"],
    relevant_instruments: ["tdi_complaint", "insurer_settlement_demand", "evidence_preservation_letter"],
  },
  medical_malpractice: {
    label: "I think a doctor or hospital hurt me",
    blurb: "You suspect medical negligence — a surgical error, misdiagnosis, or treatment mistake.",
    rights: [
      "Medical-malpractice claims have a two-year filing window tied to treatment, plus a ten-year statute of repose.",
      "Texas caps non-economic (pain and suffering) damages in malpractice cases — but economic damages are not capped.",
      "Malpractice cases usually require an expert report early in litigation — these are complex and attorney-intensive.",
    ],
    actions: [
      { step: "Obtain complete medical records from every provider involved.", urgent: true },
      { step: "Write a timeline: symptoms, visits, what went wrong, and subsequent treatment.", why: "Malpractice turns on the medical timeline." },
      { step: "Consult a malpractice attorney promptly — do not rely on a general accident deadline.", urgent: true },
    ],
    cautions: [
      "Do NOT assume the standard two-year accident rule applies — malpractice timing is different.",
      "Do NOT continue with the same provider without understanding risks if you are considering suing them.",
    ],
    relevant_statutes: ["tx-med-mal-sol", "tx-med-mal-cap"],
    relevant_instruments: ["medical_records_request"],
  },
  wrongful_death: {
    label: "Someone died because of the accident",
    blurb: "A family member was killed and you're exploring a wrongful-death claim.",
    rights: [
      "The surviving spouse, children, and parents may bring a wrongful-death action for their own losses.",
      "A separate survival action may cover the decedent's estate claims.",
      "The two-year limitations period generally runs from the date of death.",
    ],
    actions: [
      { step: "Identify who has standing to bring the claim (spouse, children, parents).", urgent: true },
      { step: "Obtain the death certificate, autopsy report, and police/incident report.", why: "Core proof of causation and damages." },
      { step: "Preserve evidence immediately — vehicles, scene data, corporate records.", urgent: true },
      { step: "Consult a wrongful-death attorney before negotiating with insurers.", why: "Damages categories and beneficiaries are fact-specific." },
    ],
    cautions: [
      "Do NOT let multiple family members negotiate separately with the insurer without coordinating.",
      "Do NOT sign any release on behalf of the estate or beneficiaries without legal review.",
    ],
    relevant_statutes: ["tx-wrongful-death", "tx-pi-sol-general"],
    relevant_instruments: ["evidence_preservation_letter", "insurer_settlement_demand"],
  },
};

const ORDER: PiSituation[] = [
  "just_happened",
  "dealing_with_insurer",
  "lowball_offer",
  "denied_claim",
  "medical_malpractice",
  "wrongful_death",
];

export const PI_SITUATIONS = ORDER.map((situation) => ({
  situation,
  label: GUIDANCE[situation].label,
  blurb: GUIDANCE[situation].blurb,
}));

export function isKnownPiSituation(s: string): s is PiSituation {
  return s in GUIDANCE;
}

export function piClaimGuideFor(situation: PiSituation): ClaimGuidance {
  const g = GUIDANCE[situation];
  return { situation, disclaimer: DISCLAIMER, ...g };
}

const SITUATION_TRIGGERS: Array<[PiSituation, string[]]> = [
  ["wrongful_death", ["wrongful death", "died", "fatal", "killed", "death in the accident"]],
  ["medical_malpractice", ["malpractice", "med mal", "doctor mistake", "surgical error", "misdiagnosis", "hospital negligence"]],
  ["denied_claim", ["denied", "denial", "refused to pay", "won't cover", "rejected my claim"]],
  ["lowball_offer", ["low offer", "lowball", "settlement offer", "they offered", "not enough money"]],
  ["dealing_with_insurer", ["adjuster", "insurance company called", "recorded statement", "insurer wants"]],
  ["just_happened", ["just happened", "yesterday", "today", "car accident", "crash", "injured", "slip and fall"]],
];

export function matchPiSituation(text: string | null | undefined): PiSituation | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  for (const [situation, terms] of SITUATION_TRIGGERS) {
    if (terms.some((t) => haystack.includes(t))) return situation;
  }
  return null;
}
