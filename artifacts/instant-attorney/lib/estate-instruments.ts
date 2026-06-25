// ── Estate-planning instrument presets ───────────────────────────────────────
//
// The documents an estate-planning matter needs — a will, the incapacity
// documents, a transfer-on-death deed, and (when warranted) a trust — defined as
// PRESETS over existing wizard types so they plug into the published document
// pipeline with no new DocType / DB enum value. Each preset carries recipient/
// recording guidance, required fields, the Texas authorities it leans on, and a
// high-stakes flag, so the drafter produces an estate-shaped document instead of
// a generic one.
//
// This mirrors lib/family-instruments.ts and lib/debt-instruments.ts. These are
// the *drafting* presets; the advisory recommendations a client sees in the
// "Do I need a trust?" planner live separately in lib/estate-planning.ts. Names
// here are prefixed `EstateDoc*` to stay distinct from that module.
//
// `relevant_statutes` reference keys in lib/estate-statutes.ts; a cross-check
// test asserts every referenced key resolves.
//
// STANCE: neutral, Texas-accurate. A will does NOT avoid probate; Texas
// independent administration keeps probate efficient but not free, and a married
// couple usually probates twice. A revocable living trust is a legitimate option
// for almost anyone but a personal call — so trust drafting is HIGH-STAKES and
// routes to attorney review/consult, never auto-recommended over a will.

import type { WizardType } from "./types.ts";
import { matchEstateStatutesByText, type EstateStatuteKey } from "./estate-statutes.ts";

export interface EstateDocInstrument {
  /** Stable identifier for the preset. */
  key: string;
  /** Human-readable label for menus and prompts. */
  label: string;
  /** What this instrument accomplishes for the client. */
  purpose: string;
  /** Which existing wizard type drafts it. */
  wizard_type: WizardType;
  /** Who the document is addressed to / how it must be executed or recorded. */
  recipient_guidance: string;
  /** Fields the drafter should gather / confirm for this instrument. */
  required_fields: string[];
  /** Texas estate authority keys (lib/estate-statutes.ts) this relies on. */
  relevant_statutes: EstateStatuteKey[];
  /** True for instruments that must bias toward attorney review / a consult. */
  high_stakes: boolean;
  /** Natural-language situations that imply this instrument. */
  triggers: string[];
}

export const ESTATE_DOC_INSTRUMENTS: EstateDocInstrument[] = [
  {
    key: "last_will_testament",
    label: "Last Will and Testament",
    purpose:
      "The backbone document: names beneficiaries and an independent executor, requests independent administration (to keep probate low-cost), makes specific and residuary gifts, and — for a parent — nominates a guardian for minor children. Note clearly that a will is probated; it organizes and cheapens probate, it does not avoid it.",
    wizard_type: "wills_trusts",
    recipient_guidance:
      "Signed by the testator and two credible witnesses (a self-proving affidavit before a notary is strongly recommended). The original is kept safe and findable; it is filed with the probate court only after death.",
    required_fields: [
      "Testator full legal name, county and state of residence, date of birth",
      "Independent executor and at least one alternate",
      "Beneficiaries with shares; any specific bequests; a residuary clause",
      "Guardian (and alternate) for any minor children",
      "Whether a minor's share should be held in a testamentary trust and to what age",
    ],
    relevant_statutes: ["tx-independent-administration", "tx-muniment-of-title", "tx-intestate-succession", "tx-declaration-of-guardian"],
    high_stakes: false,
    triggers: ["write a will", "make a will", "last will", "i need a will", "update my will"],
  },
  {
    key: "codicil",
    label: "Codicil (amendment to a will)",
    purpose:
      "A short amendment to an existing will — change an executor, a guardian, or a bequest — executed with the same formalities as a will. For extensive changes a new will is usually cleaner.",
    wizard_type: "wills_trusts",
    recipient_guidance:
      "Executed with the same formalities as a will (testator plus two witnesses; self-proving affidavit recommended) and kept with the original will.",
    required_fields: [
      "Testator full legal name and the date of the will being amended",
      "The specific change(s) being made",
      "Confirmation the rest of the will is reaffirmed",
    ],
    relevant_statutes: ["tx-independent-administration"],
    high_stakes: false,
    triggers: ["change my will", "amend my will", "codicil", "update executor"],
  },
  {
    key: "statutory_durable_poa",
    label: "Statutory Durable Power of Attorney",
    purpose:
      "Appoints an agent to manage the principal's finances and property, effective even after incapacity ('durable') — the document that helps a family avoid a costly guardianship. Texas provides a statutory form.",
    wizard_type: "wills_trusts",
    recipient_guidance:
      "Signed by the principal and notarized while the principal has capacity. Give the original/copies to the agent; financial institutions may ask for their own acknowledgment.",
    required_fields: [
      "Principal full legal name and county of residence",
      "Agent and at least one successor agent",
      "Whether it is effective immediately or only on incapacity (springing)",
      "Any powers to grant or withhold; gifting authority if intended",
    ],
    relevant_statutes: ["tx-statutory-durable-poa"],
    high_stakes: false,
    triggers: ["power of attorney", "financial poa", "durable power of attorney", "name an agent for my finances"],
  },
  {
    key: "medical_power_of_attorney",
    label: "Medical Power of Attorney",
    purpose:
      "Appoints an agent to make health-care decisions if a physician certifies the principal cannot. Pairs with a directive to physicians.",
    wizard_type: "wills_trusts",
    recipient_guidance:
      "Signed with two witnesses or notarized per the Texas form; give copies to the agent and your doctors and keep it accessible.",
    required_fields: [
      "Principal full legal name",
      "Health-care agent and an alternate",
      "Any limits on the agent's authority",
    ],
    relevant_statutes: ["tx-medical-power-of-attorney"],
    high_stakes: false,
    triggers: ["medical power of attorney", "health care agent", "who makes my medical decisions"],
  },
  {
    key: "directive_to_physicians",
    label: "Directive to Physicians (living will)",
    purpose:
      "Records the principal's wishes about life-sustaining treatment in a terminal or irreversible condition, so the family isn't left guessing.",
    wizard_type: "wills_trusts",
    recipient_guidance:
      "Executed per the Texas Advance Directives Act (two witnesses or notarization); give copies to the medical agent and physicians.",
    required_fields: [
      "Declarant full legal name",
      "Treatment wishes for a terminal vs. an irreversible condition",
      "Any specific instructions (e.g., artificial nutrition/hydration)",
    ],
    relevant_statutes: ["tx-directive-to-physicians"],
    high_stakes: false,
    triggers: ["living will", "directive to physicians", "end of life wishes", "advance directive"],
  },
  {
    key: "declaration_of_guardian",
    label: "Declaration of Guardian",
    purpose:
      "Names, in advance, who should serve as guardian of the person/estate if one is ever needed, and lets a parent designate a guardian for minor children — reducing the chance a court picks someone you wouldn't.",
    wizard_type: "wills_trusts",
    recipient_guidance:
      "Executed with the statutory formalities (witnesses or notarization); a guardian for minor children is typically also named in the will.",
    required_fields: [
      "Declarant full legal name",
      "Preferred guardian(s) and alternates; anyone to disqualify",
      "For parents: guardian and alternate for each minor child",
    ],
    relevant_statutes: ["tx-declaration-of-guardian"],
    high_stakes: false,
    triggers: ["declaration of guardian", "guardian for my kids", "who raises my children", "name a guardian"],
  },
  {
    key: "transfer_on_death_deed",
    label: "Transfer on Death Deed",
    purpose:
      "Passes the owner's Texas real estate to a named beneficiary at death, outside probate, while the owner keeps full control and the right to revoke — the cheapest, highest-impact probate-avoidance tool for a homeowner.",
    wizard_type: "general_document",
    recipient_guidance:
      "CRITICAL: must be signed, notarized, AND recorded in the deed records of the county where the property sits BEFORE death — an unrecorded deed does nothing. Provide the legal description from the current deed, not just the street address.",
    required_fields: [
      "Owner(s) full legal name(s)",
      "Legal description of the property (from the existing deed) and county",
      "Primary and alternate beneficiary(ies)",
      "Confirmation the owner will record it before death",
    ],
    relevant_statutes: ["tx-transfer-on-death-deed"],
    high_stakes: false,
    triggers: ["transfer on death deed", "TODD", "avoid probate on my house", "pass my home outside probate"],
  },
  {
    key: "revocable_living_trust",
    label: "Revocable Living Trust",
    purpose:
      "A trust the settlor controls during life that owns retitled assets so they avoid probate, stay private, and are managed by a successor trustee on incapacity. Drafting it is only half the job — it must be FUNDED by retitling assets into it. A legitimate option for almost anyone, but a personal call and more involved than a will, so it routes to attorney review.",
    wizard_type: "wills_trusts",
    recipient_guidance:
      "Signed by the settlor/trustee per the Texas Trust Code, then FUNDED — deeds, account retitling, and beneficiary updates into the trust. Pair it with a pour-over will. Funding is the step people skip.",
    required_fields: [
      "Settlor full legal name and county of residence",
      "Initial and successor trustee(s)",
      "Beneficiaries and distribution terms (including any ages/staggering)",
      "The specific assets to be funded into the trust (the funding list)",
      "Whether a pour-over will and powers of attorney are being prepared alongside",
    ],
    relevant_statutes: ["tx-revocable-living-trust", "tx-transfer-on-death-deed"],
    high_stakes: true,
    triggers: ["living trust", "revocable trust", "set up a trust", "create a trust"],
  },
  {
    key: "pour_over_will",
    label: "Pour-Over Will",
    purpose:
      "The companion will used WITH a living trust: it 'pours' any assets left outside the trust at death into it. Note honestly that assets caught by a pour-over will still pass through probate — it's a backstop, which is why funding the trust during life matters.",
    wizard_type: "wills_trusts",
    recipient_guidance:
      "Executed with full will formalities (testator plus two witnesses; self-proving affidavit recommended) and kept with the trust documents.",
    required_fields: [
      "Testator full legal name and county of residence",
      "The trust it pours into (name and date)",
      "Independent executor and alternate",
      "Guardian (and alternate) for any minor children",
    ],
    relevant_statutes: ["tx-revocable-living-trust", "tx-independent-administration"],
    high_stakes: true,
    triggers: ["pour over will", "pour-over will", "will with my trust", "trust and will package"],
  },
  {
    key: "special_needs_trust",
    label: "Special (Supplemental) Needs Trust",
    purpose:
      "Holds an inheritance for a beneficiary with a disability so it supplements rather than disqualifies means-tested benefits (SSI/Medicaid). Must be drafted precisely — high-stakes and not a DIY document.",
    wizard_type: "wills_trusts",
    recipient_guidance:
      "Drafted to satisfy the SSI/Medicaid rules and signed per the Texas Trust Code. Never name the disabled beneficiary directly on a will or beneficiary form instead.",
    required_fields: [
      "Settlor and disabled beneficiary full legal names",
      "Trustee and successor trustee",
      "Whether it is a first-party (d4A) or third-party trust",
      "The benefits the beneficiary receives or may need (SSI, Medicaid)",
    ],
    relevant_statutes: ["tx-special-needs-trust"],
    high_stakes: true,
    triggers: ["special needs trust", "supplemental needs trust", "disabled child inheritance", "protect benefits"],
  },
];

const BY_KEY = new Map(ESTATE_DOC_INSTRUMENTS.map((i) => [i.key, i]));

export type EstateDocInstrumentKey = (typeof ESTATE_DOC_INSTRUMENTS)[number]["key"];

export function getEstateDocInstrument(key: string): EstateDocInstrument | undefined {
  return BY_KEY.get(key);
}

export function isKnownEstateDocInstrumentKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact catalog for injection into the intake system prompt. */
export function estateInstrumentsForPrompt(): string {
  return ESTATE_DOC_INSTRUMENTS.map(
    (i) =>
      `• ${i.key} (drafts via ${i.wizard_type})${i.high_stakes ? " [HIGH-STAKES — recommend consult]" : ""} — ${i.label}: ${i.purpose}`
  ).join("\n");
}

/** Field-hint text for the drafter, shaped like WIZARD_FIELD_HINTS entries. */
export function estateInstrumentFieldHint(key: string): string | null {
  const inst = BY_KEY.get(key);
  if (!inst) return null;
  return `${inst.label}. ${inst.purpose} Execution: ${inst.recipient_guidance} Required fields: ${inst.required_fields.join("; ")}.`;
}

/** Offline keyword fallback: surface instruments whose triggers appear in free text. */
export function matchEstateInstrumentsByText(text: string): EstateDocInstrument[] {
  const haystack = text.toLowerCase();
  return ESTATE_DOC_INSTRUMENTS.filter((i) => i.triggers.some((t) => haystack.includes(t.toLowerCase())));
}

// Short, single-concept terms an estate matter is described by, to complement
// the multi-word instrument/statute triggers (mirrors family-instruments).
const ESTATE_CORE_TERMS = [
  "estate plan",
  "estate planning",
  "will",
  "trust",
  "probate",
  "power of attorney",
  "guardian",
  "beneficiary",
  "inheritance",
  "incapacity",
  "living will",
  "directive to physicians",
  "transfer on death",
  "asset protection",
];

/**
 * Whether free text (e.g. a case's matter subtype + summary) looks like an
 * estate-planning matter. Used to decide whether to surface the estate tools.
 */
export function looksLikeEstateMatter(text: string | null | undefined): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  if (ESTATE_CORE_TERMS.some((t) => haystack.includes(t))) return true;
  if (matchEstateInstrumentsByText(haystack).length > 0) return true;
  return matchEstateStatutesByText(haystack).length > 0;
}
