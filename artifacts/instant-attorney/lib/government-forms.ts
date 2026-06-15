// ── Government form registry ─────────────────────────────────────────────────
//
// Curated catalog of real government forms (federal / state / local). This is the
// substance behind Instant Attorney's form assistance: every entry cites an
// official .gov source and a revision date, so detection can only ever surface a
// real form — the model is constrained to these `key`s and cannot invent a form
// number.
//
// Detection happens in the ACP chat (see lib/prompts.ts + lib/file-parser.ts):
// when the assistant notices a form is needed it emits a ---GOVERNMENT FORMS---
// block referencing these keys, which is persisted as a form "instrument" to
// complete (schema-stage10.sql). The guided-completion tool then walks the client
// through the fields below.

export type GovFormFieldType =
  | "string"
  | "ssn"
  | "date"
  | "number"
  | "boolean"
  | "enum"
  | "address";

export interface GovFormField {
  name: string;
  label: string;
  type: GovFormFieldType;
  help?: string;
  options?: string[];
  /** Defaults to true. Set false for optional fields. */
  required?: boolean;
}

export interface GovernmentForm {
  /** Stable identifier referenced by detection + persistence. */
  key: string;
  form_number: string;
  title: string;
  agency: string;
  /** "Federal", a state name/abbrev, or a locality. */
  jurisdiction: string;
  /** True when the relevant jurisdiction depends on the client's state. */
  state_specific: boolean;
  official_url: string;
  revision: string;
  purpose: string;
  who_needs_it: string;
  deadline: string;
  fee: string;
  submit_to: string;
  fields: GovFormField[];
  common_mistakes: string[];
  /** Natural-language situations that imply this form, used to guide detection. */
  triggers: string[];
}

export const GOVERNMENT_FORMS: GovernmentForm[] = [
  {
    key: "irs-w4",
    form_number: "Form W-4",
    title: "Employee's Withholding Certificate",
    agency: "Internal Revenue Service (IRS)",
    jurisdiction: "Federal",
    state_specific: false,
    official_url: "https://www.irs.gov/forms-pubs/about-form-w-4",
    revision: "2025",
    purpose: "Tells your employer how much federal income tax to withhold from your paycheck.",
    who_needs_it: "Anyone starting a new job, or whose financial/family situation changed (marriage, a new child, a second job).",
    deadline: "Give to your employer on or before your first payday; update anytime your situation changes.",
    fee: "No fee.",
    submit_to: "Your employer's HR/payroll department — not mailed to the IRS.",
    fields: [
      { name: "full_name", label: "Full legal name", type: "string", help: "As it appears on your Social Security card." },
      { name: "ssn", label: "Social Security Number", type: "ssn", help: "9 digits. Required for accurate withholding." },
      { name: "filing_status", label: "Filing status", type: "enum", options: ["Single or Married filing separately", "Married filing jointly", "Head of household"], help: "Pick the one that matches how you'll file your tax return." },
      { name: "multiple_jobs", label: "More than one job, or a working spouse?", type: "boolean", help: "If yes, Step 2 helps you withhold the right amount." },
      { name: "dependents_credit", label: "Claimed dependents (annual credit amount)", type: "number", required: false, help: "Children under 17: $2,000 each; other dependents: $500 each." },
    ],
    common_mistakes: [
      "Leaving Step 2 blank when you have two jobs — this under-withholds and creates a tax bill in April.",
      "Forgetting to sign and date (Step 5) — an unsigned W-4 is invalid.",
    ],
    triggers: ["started a new job", "new employer", "first day at work", "tax withholding", "got married", "had a baby"],
  },
  {
    key: "uscis-i9",
    form_number: "Form I-9",
    title: "Employment Eligibility Verification",
    agency: "U.S. Citizenship and Immigration Services (USCIS)",
    jurisdiction: "Federal",
    state_specific: false,
    official_url: "https://www.uscis.gov/i-9",
    revision: "2025",
    purpose: "Verifies your identity and authorization to work in the United States.",
    who_needs_it: "Every employee hired in the U.S. completes Section 1; the employer completes Section 2.",
    deadline: "Section 1 by your first day of work; present documents within 3 business days of starting.",
    fee: "No fee.",
    submit_to: "Your employer retains the form — it is not sent to USCIS.",
    fields: [
      { name: "full_name", label: "Full legal name", type: "string" },
      { name: "address", label: "Current address", type: "address" },
      { name: "dob", label: "Date of birth", type: "date" },
      { name: "citizenship_status", label: "Citizenship / immigration status", type: "enum", options: ["U.S. citizen", "Noncitizen national", "Lawful permanent resident", "Authorized to work (with expiration)"] },
      { name: "document_type", label: "Which documents will you present?", type: "string", help: "Either one List A document (e.g., passport) OR one List B + one List C (e.g., driver's license + Social Security card)." },
    ],
    common_mistakes: [
      "Bringing photocopies — employers must see original, unexpired documents.",
      "Mixing up List A vs. List B+C — you need either one List A item or one each from B and C.",
    ],
    triggers: ["started a new job", "new employer", "employment eligibility", "work authorization", "first day at work"],
  },
  {
    key: "uscis-i90",
    form_number: "Form I-90",
    title: "Application to Replace Permanent Resident Card",
    agency: "U.S. Citizenship and Immigration Services (USCIS)",
    jurisdiction: "Federal",
    state_specific: false,
    official_url: "https://www.uscis.gov/i-90",
    revision: "2025",
    purpose: "Replaces a Green Card that was lost, stolen, damaged, expired, or contains incorrect information.",
    who_needs_it: "Lawful permanent residents needing a new or corrected Green Card.",
    deadline: "File as soon as the card is expiring (renew within 6 months of expiration), lost, or wrong.",
    fee: "Filing fee plus biometrics fee may apply; fee waivers exist for some applicants. Check the official fee schedule.",
    submit_to: "File online at my.uscis.gov or by mail to the address in the form instructions for your situation.",
    fields: [
      { name: "full_name", label: "Full legal name", type: "string" },
      { name: "a_number", label: "Alien Registration Number (A-Number)", type: "string", help: "Starts with 'A' followed by 8–9 digits, found on your current card." },
      { name: "reason", label: "Reason for replacement", type: "enum", options: ["Card lost/stolen/damaged", "Card expiring or expired", "Incorrect data on card", "Name or other change"] },
      { name: "mailing_address", label: "Mailing address", type: "address" },
    ],
    common_mistakes: [
      "Using I-90 when you actually need to remove conditions (that's Form I-751) — different situation.",
      "Not keeping a copy of the filed application and receipt notice (Form I-797).",
    ],
    triggers: ["green card", "permanent resident card", "card expiring", "lost green card", "renew green card"],
  },
  {
    key: "dmv-address-change-tx",
    form_number: "DL-43 (Texas)",
    title: "Texas Driver License / ID Card Change of Address",
    agency: "Texas Department of Public Safety (DPS)",
    jurisdiction: "Texas",
    state_specific: true,
    official_url: "https://www.dps.texas.gov/section/driver-license/change-address-emergency-contact-information",
    revision: "2025",
    purpose: "Updates the address on your Texas driver license or ID card after a move.",
    who_needs_it: "Texas license/ID holders who changed their residence address.",
    deadline: "Within 30 days of moving (Texas law).",
    fee: "No fee for an online address change; a replacement card with the new address printed has a small fee.",
    submit_to: "Online via the Texas DPS portal, or in person at a driver license office.",
    fields: [
      { name: "full_name", label: "Full legal name", type: "string" },
      { name: "dl_number", label: "Driver license / ID number", type: "string" },
      { name: "dob", label: "Date of birth", type: "date" },
      { name: "old_address", label: "Previous address", type: "address" },
      { name: "new_address", label: "New Texas address", type: "address" },
    ],
    common_mistakes: [
      "Assuming the address change also re-registers you to vote — confirm voter registration separately.",
      "Forgetting to also update your vehicle registration address with the county tax office.",
    ],
    triggers: ["moved to texas", "new address in texas", "changed address", "relocated to texas"],
  },
  {
    key: "voter-registration",
    form_number: "National Mail Voter Registration Form",
    title: "Voter Registration Application",
    agency: "U.S. Election Assistance Commission (states administer)",
    jurisdiction: "Federal form accepted by most states",
    state_specific: false,
    official_url: "https://www.eac.gov/voters/national-mail-voter-registration-form",
    revision: "2025",
    purpose: "Registers you to vote, or updates your registration after a move or name change.",
    who_needs_it: "Eligible citizens who moved, changed their name, or are registering for the first time.",
    deadline: "Varies by state — often 15–30 days before an election. Register as soon as you move.",
    fee: "No fee.",
    submit_to: "Mail to your state/local election office (address in the form's state instructions), or use your state's online portal.",
    fields: [
      { name: "full_name", label: "Full legal name", type: "string" },
      { name: "address", label: "Home (residence) address", type: "address", help: "Where you live — not a P.O. box." },
      { name: "dob", label: "Date of birth", type: "date" },
      { name: "citizen", label: "Are you a U.S. citizen?", type: "boolean", help: "You must be a citizen to register." },
      { name: "id_number", label: "Driver license number or last 4 of SSN", type: "string" },
    ],
    common_mistakes: [
      "Using a P.O. box as the residence address — use your physical home address.",
      "Missing your state's registration deadline before an election.",
    ],
    triggers: ["moved", "relocated", "new address", "changed my name", "register to vote"],
  },
];

const FORMS_BY_KEY: Record<string, GovernmentForm> = Object.fromEntries(
  GOVERNMENT_FORMS.map((f) => [f.key, f])
);

export function getGovernmentForm(key: string): GovernmentForm | undefined {
  return FORMS_BY_KEY[key];
}

export function isKnownFormKey(key: string): boolean {
  return key in FORMS_BY_KEY;
}

/** Compact catalog injected into the detection prompt so the model only ever
 * references real form keys. */
export function formCatalogForPrompt(): string {
  return GOVERNMENT_FORMS.map(
    (f) =>
      `- ${f.key} :: ${f.form_number} — ${f.title} (${f.agency}, ${f.jurisdiction}). Needed when: ${f.who_needs_it}`
  ).join("\n");
}

/** Offline fallback / safety net: keyword match over triggers. Detection is
 * primarily LLM-driven, but this guarantees obvious situations are caught even
 * if the model omits the block. */
export function matchFormsByText(text: string): GovernmentForm[] {
  const lowered = text.toLowerCase();
  return GOVERNMENT_FORMS.filter((f) =>
    f.triggers.some((t) => lowered.includes(t.toLowerCase()))
  );
}
