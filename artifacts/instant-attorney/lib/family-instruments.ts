// ── Family-law instrument presets ────────────────────────────────────────────
//
// The documents a family-law matter actually needs don't map cleanly onto a
// generic "demand letter." This catalog defines family-law instruments as
// PRESETS over the existing wizard types (no new DocType / DB enum value, so it
// never disturbs the published document pipeline). Each preset carries recipient
// guidance, required fields, a response/answer-deadline default, and the Texas
// Family Code statutes it leans on, so the drafter produces a family-shaped
// document instead of a generic one.
//
// This mirrors lib/hoa-instruments.ts. `relevant_statutes` reference keys in
// lib/family-statutes.ts; a cross-check test asserts every referenced key
// resolves.
//
// SAFETY NOTE: family-violence matters route to the protective-order instrument
// and an attorney/safety hand-off — never auto-draft an adversarial filing that
// could escalate danger. The intake prompt enforces this.

import type { WizardType } from "./types.ts";
import type { FamilyStatuteKey } from "./family-statutes.ts";

export interface FamilyInstrument {
  /** Stable identifier for the preset. */
  key: string;
  /** Human-readable label for menus and prompts. */
  label: string;
  /** What this instrument accomplishes for the client. */
  purpose: string;
  /** Which existing wizard type drafts it. */
  wizard_type: WizardType;
  /** Who the document should be addressed to / filed with. */
  recipient_guidance: string;
  /** Fields the drafter should gather / confirm for this instrument. */
  required_fields: string[];
  /** Texas Family Code statute keys (lib/family-statutes.ts) this relies on. */
  relevant_statutes: FamilyStatuteKey[];
  /** Default response/answer window to assert in the document, or null. */
  default_response_days: number | null;
  /** True for safety-critical instruments that must bias toward attorney review. */
  high_stakes: boolean;
  /** Natural-language situations that imply this instrument. */
  triggers: string[];
}

export const FAMILY_INSTRUMENTS: FamilyInstrument[] = [
  {
    key: "original_petition_divorce",
    label: "Original Petition for Divorce",
    purpose:
      "Open a divorce case: identify the parties and any children, state the grounds, and request the relief sought (property division, conservatorship, support).",
    wizard_type: "general_document",
    recipient_guidance:
      "Filed with the district clerk in the county of residence; the respondent spouse is then served. Caption it for the proper district/family court.",
    required_fields: [
      "Petitioner and respondent full legal names and county of residence",
      "Date and place of marriage and date of separation",
      "Names and birthdates of any children of the marriage",
      "Grounds (insupportability / no-fault, or any fault ground)",
      "Relief requested (property division, conservatorship, support, name change)",
    ],
    relevant_statutes: [
      "tx-fam-divorce-grounds",
      "tx-fam-residency",
      "tx-fam-divorce-waiting",
    ],
    default_response_days: null,
    high_stakes: false,
    triggers: ["file for divorce", "start a divorce", "divorce petition", "petition for divorce"],
  },
  {
    key: "waiver_or_answer",
    label: "Waiver of Service / Respondent's Answer",
    purpose:
      "Respond to a divorce or SAPCR petition — either by waiving formal service (uncontested) or filing a general-denial answer to preserve the respondent's rights.",
    wizard_type: "general_document",
    recipient_guidance:
      "Filed with the district clerk under the existing cause number; a waiver must be signed before a notary after the petition is on file.",
    required_fields: [
      "Respondent full legal name",
      "Cause number, county, and court",
      "Whether the respondent is waiving service (uncontested) or filing an answer",
      "Petitioner full legal name",
    ],
    relevant_statutes: ["tx-fam-divorce-grounds"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["was served", "respond to divorce", "answer", "waiver of service", "got divorce papers"],
  },
  {
    key: "final_decree_divorce",
    label: "Final Decree of Divorce",
    purpose:
      "Memorialize the final terms of the divorce — property division, debts, conservatorship, possession schedule, and child/spousal support — for the judge to sign.",
    wizard_type: "general_document",
    recipient_guidance:
      "Prepared for the court's signature under the cause number; in an agreed divorce both parties (and counsel, if any) sign as to form and substance.",
    required_fields: [
      "Cause number, county, and court; both parties' full legal names",
      "Community property and debts and how each is awarded",
      "Conservatorship designation and allocation of rights and duties",
      "Possession and access schedule (or SPO by reference)",
      "Child support amount, medical/dental support, and any spousal maintenance",
    ],
    relevant_statutes: [
      "tx-fam-property-division",
      "tx-fam-conservatorship",
      "tx-fam-spo",
      "tx-fam-support-guidelines",
    ],
    default_response_days: null,
    high_stakes: true,
    triggers: ["final decree", "divorce decree", "finalize divorce", "settlement terms"],
  },
  {
    key: "sapcr_petition",
    label: "SAPCR Petition (Custody / Support — Unmarried Parents)",
    purpose:
      "Open a Suit Affecting the Parent-Child Relationship to establish conservatorship, possession, and child support outside of a divorce.",
    wizard_type: "general_document",
    recipient_guidance:
      "Filed with the district clerk in the child's home county; the other parent is then served. Confirm parentage is or will be established first.",
    required_fields: [
      "Petitioner name and relationship to the child",
      "Other parent's full legal name",
      "Child's full name, birthdate, and home county",
      "Conservatorship, possession, and support requested",
      "Whether parentage is already established",
    ],
    relevant_statutes: [
      "tx-fam-best-interest",
      "tx-fam-conservatorship",
      "tx-fam-parentage",
      "tx-fam-support-guidelines",
    ],
    default_response_days: null,
    high_stakes: false,
    triggers: ["custody case", "not married custody", "establish custody", "sapcr", "child custody petition"],
  },
  {
    key: "proposed_parenting_plan",
    label: "Proposed Parenting Plan / Possession Schedule",
    purpose:
      "Set out a concrete, child-centered possession and access schedule (weekends, holidays, summer) and the allocation of parental rights, starting from the Standard Possession Order.",
    wizard_type: "general_document",
    recipient_guidance:
      "Exchanged with the other parent or their counsel and offered to the court; designed to be incorporated into a decree or SAPCR order.",
    required_fields: [
      "Both parents' names and the child's name and age",
      "Whether the parents live within 100 miles of each other",
      "Regular weekend/weekday schedule (SPO default or a proposed variation)",
      "Holiday and summer possession split",
      "Exchange logistics (times, locations, transportation)",
    ],
    relevant_statutes: ["tx-fam-best-interest", "tx-fam-spo"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["parenting plan", "possession schedule", "visitation schedule", "custody schedule", "holiday schedule"],
  },
  {
    key: "child_support_proposal",
    label: "Proposed Child Support Order / Worksheet",
    purpose:
      "Document a guideline child-support calculation — net resources, number of children, and the resulting amount and medical/dental support — for agreement or court.",
    wizard_type: "general_document",
    recipient_guidance:
      "Exchanged with the other parent or their counsel; incorporated into the decree/SAPCR order and useful for the Office of the Attorney General Child Support Division.",
    required_fields: [
      "Paying parent's monthly net resources (and how derived)",
      "Number of children before the court and any other children supported",
      "Cost of the child's health and dental insurance and who provides it",
      "Resulting guideline amount (or agreed deviation and reason)",
    ],
    relevant_statutes: ["tx-fam-support-guidelines", "tx-fam-net-resources"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["child support order", "support worksheet", "calculate child support", "how much support"],
  },
  {
    key: "premarital_or_marital_agreement",
    label: "Premarital / Marital Property Agreement",
    purpose:
      "Draft a premarital (prenuptial) or post-marital agreement defining each spouse's separate property and how property and debts are characterized.",
    wizard_type: "draft_contract",
    recipient_guidance:
      "A contract between the spouses (or spouses-to-be); each party should have the opportunity for independent review before signing.",
    required_fields: [
      "Both parties' full legal names and the date of the agreement",
      "Each party's separate property and debts to be confirmed",
      "How future income, gifts, and acquisitions are characterized",
      "Any waiver or limitation of spousal maintenance",
      "Disclosure of assets and acknowledgment of voluntary signing",
    ],
    relevant_statutes: ["tx-fam-property-division", "tx-fam-maintenance-eligibility"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["prenup", "prenuptial", "postnup", "marital agreement", "before we marry", "protect my assets"],
  },
  {
    key: "motion_to_modify",
    label: "Motion to Modify (Custody or Support)",
    purpose:
      "Ask the court to change an existing conservatorship, possession, or support order based on a material and substantial change in circumstances.",
    wizard_type: "general_document",
    recipient_guidance:
      "Filed under the original cause number in the court of continuing jurisdiction; the other party is served or waives service.",
    required_fields: [
      "Cause number, county, and court of the existing order",
      "Both parties' full legal names and the child's name",
      "The order provision to be changed and the change requested",
      "The material and substantial change in circumstances since the last order",
    ],
    relevant_statutes: ["tx-fam-modification", "tx-fam-best-interest"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["modify custody", "change support", "modification", "lost my job support", "they moved", "change the order"],
  },
  {
    key: "motion_to_enforce",
    label: "Motion to Enforce (Support or Possession)",
    purpose:
      "Enforce a final order when the other parent fails to pay support or denies court-ordered possession, seeking judgment for arrears, contempt, and fees.",
    wizard_type: "general_document",
    recipient_guidance:
      "Filed under the original cause number; must identify each violation specifically (dates, amounts, missed periods) to support contempt.",
    required_fields: [
      "Cause number, county, and court of the order being enforced",
      "The specific provision violated (support amount or possession period)",
      "Each violation with its date and amount/occurrence",
      "Total arrearage claimed, if support",
      "Relief requested (judgment, contempt, attorney's fees)",
    ],
    relevant_statutes: ["tx-fam-enforcement"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["not paying support", "behind on support", "denied my visitation", "enforce the order", "contempt", "back child support"],
  },
  {
    key: "protective_order_application",
    label: "Application for Protective Order (Family Violence)",
    purpose:
      "Seek a protective order — including an emergency temporary ex parte order — for a victim of family violence and any children in the household.",
    wizard_type: "general_document",
    recipient_guidance:
      "Filed with the district/county clerk at no fee to the applicant; coordinate with local law enforcement and a family-violence advocate. TIME-SENSITIVE and SAFETY-CRITICAL.",
    required_fields: [
      "Applicant name and the respondent's name and relationship",
      "Description of the most recent and any prior family violence (dates, what happened)",
      "Whether children are involved and need protection",
      "Specific protections requested (no contact, stay-away distance, exclusive use of residence)",
      "Whether an emergency temporary ex parte order is needed",
    ],
    relevant_statutes: ["tx-fam-protective-order"],
    default_response_days: null,
    high_stakes: true,
    triggers: ["protective order", "restraining order", "family violence", "abuse", "afraid", "threatened", "domestic violence", "hit me", "unsafe"],
  },
  {
    key: "petition_to_establish_parentage",
    label: "Petition to Establish Parentage (Paternity)",
    purpose:
      "Establish legal parentage so an unmarried parent can pursue custody, possession, and support — by acknowledgment or court order, with genetic testing if needed.",
    wizard_type: "general_document",
    recipient_guidance:
      "Filed with the district clerk in the child's home county; the alleged parent is served. Often paired with a SAPCR for custody and support.",
    required_fields: [
      "Petitioner name and relationship to the child",
      "Alleged parent's full legal name",
      "Child's full name and birthdate",
      "Whether an Acknowledgment of Paternity exists or genetic testing is requested",
    ],
    relevant_statutes: ["tx-fam-parentage", "tx-fam-best-interest"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["paternity", "establish father", "is he the father", "acknowledgment of paternity", "dna test", "not married parent"],
  },
];

export type FamilyInstrumentKey = (typeof FAMILY_INSTRUMENTS)[number]["key"];

const BY_KEY = new Map(FAMILY_INSTRUMENTS.map((i) => [i.key, i]));

export function getFamilyInstrument(key: string): FamilyInstrument | undefined {
  return BY_KEY.get(key);
}

export function isKnownFamilyInstrumentKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact catalog for injection into the intake system prompt. */
export function familyInstrumentsForPrompt(): string {
  return FAMILY_INSTRUMENTS.map(
    (i) =>
      `• ${i.key} (drafts via ${i.wizard_type})${i.high_stakes ? " [HIGH-STAKES — recommend consult]" : ""} — ${i.label}: ${i.purpose}`
  ).join("\n");
}

/** Field-hint text for the drafter, shaped like WIZARD_FIELD_HINTS entries. */
export function familyInstrumentFieldHint(key: string): string | null {
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
export function matchFamilyInstrumentsByText(text: string): FamilyInstrument[] {
  const haystack = text.toLowerCase();
  return FAMILY_INSTRUMENTS.filter((i) =>
    i.triggers.some((t) => haystack.includes(t.toLowerCase()))
  );
}
