/**
 * Document execution classifier.
 *
 * Instant Attorney does not treat every "signature" the same way:
 *   - esign            → client can sign quickly in-app (and via Dropbox Sign when configured)
 *   - print_formalities → needs witnesses and/or a notary; print & go with labeled signature roles
 *   - send_only        → client signs (or just sends) a letter; no formal ceremony
 *   - court_signature  → judge / clerk signs; parties may acknowledge form
 *
 * Instrument keys are the primary lookup. Title / engine heuristics are the
 * fallback for drafts that were never stamped with a plan_key.
 */

export type ExecutionMode =
  | "esign"
  | "print_formalities"
  | "send_only"
  | "court_signature";

export interface InstrumentExecution {
  mode: ExecutionMode;
  /** True when an in-app / Dropbox Sign electronic signature is legally appropriate. */
  esign_allowed: boolean;
  needs_notary: boolean;
  /** Number of witnesses required (0 if none). */
  witness_count: number;
  /** Must be recorded with a county clerk (e.g. TOD deed). */
  needs_recording: boolean;
  /** Labeled signature / acknowledgment roles shown on the print packet. */
  signature_roles: string[];
  /** Short, numbered print-and-go steps for the client. */
  print_steps: string[];
  /** One-line badge label for the documents list. */
  badge: string;
}

const ESIGN_DEFAULT: InstrumentExecution = {
  mode: "esign",
  esign_allowed: true,
  needs_notary: false,
  witness_count: 0,
  needs_recording: false,
  signature_roles: ["Client / party"],
  print_steps: [
    "Review the attorney-approved document.",
    "Sign electronically in Instant Attorney (or via the secure e-sign link when a counterparty must sign too).",
    "Download the completed copy for your records.",
  ],
  badge: "E-sign ready",
};

const SEND_DEFAULT: InstrumentExecution = {
  mode: "send_only",
  esign_allowed: true,
  needs_notary: false,
  witness_count: 0,
  needs_recording: false,
  signature_roles: ["Your signature (closing)"],
  print_steps: [
    "Review the attorney-approved letter.",
    "Sign the closing block (electronic is fine for most demand / notice letters).",
    "Send by the method noted in the letter (often certified mail) and keep proof of mailing.",
  ],
  badge: "Sign & send",
};

function formalities(partial: {
  needs_notary: boolean;
  witness_count: number;
  needs_recording?: boolean;
  signature_roles: string[];
  print_steps: string[];
  badge: string;
}): InstrumentExecution {
  return {
    mode: "print_formalities",
    esign_allowed: false,
    needs_recording: partial.needs_recording ?? false,
    ...partial,
  };
}

function court(partial: {
  signature_roles: string[];
  print_steps: string[];
  badge?: string;
}): InstrumentExecution {
  return {
    mode: "court_signature",
    esign_allowed: false,
    needs_notary: false,
    witness_count: 0,
    needs_recording: false,
    badge: partial.badge ?? "Court signs",
    signature_roles: partial.signature_roles,
    print_steps: partial.print_steps,
  };
}

/** Explicit execution metadata keyed by instrument preset key. */
export const INSTRUMENT_EXECUTION: Record<string, InstrumentExecution> = {
  // ── Estate (almost all formalities) ───────────────────────────────────────
  last_will_testament: formalities({
    needs_notary: true,
    witness_count: 2,
    signature_roles: [
      "Testator",
      "Witness 1 (credible, not a beneficiary)",
      "Witness 2 (credible, not a beneficiary)",
      "Notary (self-proving affidavit — strongly recommended)",
    ],
    print_steps: [
      "Print the attorney-approved will (do not e-sign).",
      "Sign as Testator in front of two credible witnesses who are not beneficiaries.",
      "Have both witnesses sign the will in your presence.",
      "Complete the self-proving affidavit before a notary (same sitting is ideal).",
      "Store the ORIGINAL in a safe, findable place — probate needs the original.",
    ],
    badge: "Print · 2 witnesses · notary",
  }),
  codicil: formalities({
    needs_notary: true,
    witness_count: 2,
    signature_roles: ["Testator", "Witness 1", "Witness 2", "Notary (self-proving affidavit)"],
    print_steps: [
      "Print the codicil (same formalities as a will).",
      "Sign before two credible witnesses; complete a self-proving affidavit before a notary.",
      "Keep it with the original will.",
    ],
    badge: "Print · 2 witnesses · notary",
  }),
  statutory_durable_poa: formalities({
    needs_notary: true,
    witness_count: 0,
    signature_roles: ["Principal", "Notary"],
    print_steps: [
      "Print the statutory durable power of attorney.",
      "Sign as Principal before a notary while you still have capacity.",
      "Give the original or certified copies to your agent; banks may ask for their own acknowledgment form.",
    ],
    badge: "Print · notarize",
  }),
  medical_power_of_attorney: formalities({
    needs_notary: true,
    witness_count: 2,
    signature_roles: [
      "Principal",
      "Witness 1 OR Notary (Texas form allows either two witnesses or notarization)",
      "Witness 2 (if using witnesses)",
    ],
    print_steps: [
      "Print the medical power of attorney.",
      "Sign per the Texas form: two qualified witnesses OR a notary.",
      "Give copies to your health-care agent and your doctors; keep one accessible.",
    ],
    badge: "Print · witnesses or notary",
  }),
  directive_to_physicians: formalities({
    needs_notary: true,
    witness_count: 2,
    signature_roles: [
      "Declarant",
      "Witness 1 OR Notary",
      "Witness 2 (if using witnesses)",
    ],
    print_steps: [
      "Print the directive to physicians.",
      "Sign with two witnesses or a notary under the Texas Advance Directives Act.",
      "Give copies to your medical agent and physicians.",
    ],
    badge: "Print · witnesses or notary",
  }),
  declaration_of_guardian: formalities({
    needs_notary: true,
    witness_count: 2,
    signature_roles: ["Declarant", "Witnesses or Notary (per statutory form)"],
    print_steps: [
      "Print the declaration of guardian.",
      "Execute with the statutory formalities (witnesses or notarization).",
      "Keep with your estate documents; also name guardians in your will when you have minors.",
    ],
    badge: "Print · witnesses or notary",
  }),
  transfer_on_death_deed: formalities({
    needs_notary: true,
    witness_count: 0,
    needs_recording: true,
    signature_roles: ["Owner / grantor", "Notary", "County clerk (recording)"],
    print_steps: [
      "Print the transfer-on-death deed with the full legal description from your current deed.",
      "Sign before a notary.",
      "RECORD it in the deed records of the county where the property sits BEFORE death — an unrecorded deed does nothing.",
      "Keep the recorded copy with your estate file.",
    ],
    badge: "Print · notarize · record",
  }),
  revocable_living_trust: formalities({
    needs_notary: true,
    witness_count: 0,
    signature_roles: ["Settlor / trustee", "Notary (recommended)", "Funding documents (deeds, retitling)"],
    print_steps: [
      "Print and sign the trust agreement (notarization recommended).",
      "FUND the trust — retitle assets, update deeds and beneficiary forms. An unfunded trust does nothing.",
      "Pair with a pour-over will and keep originals together.",
    ],
    badge: "Print · sign · fund",
  }),
  pour_over_will: formalities({
    needs_notary: true,
    witness_count: 2,
    signature_roles: ["Testator", "Witness 1", "Witness 2", "Notary (self-proving affidavit)"],
    print_steps: [
      "Print the pour-over will.",
      "Execute with full will formalities: testator + two witnesses + self-proving affidavit.",
      "Keep with the trust originals.",
    ],
    badge: "Print · 2 witnesses · notary",
  }),
  special_needs_trust: formalities({
    needs_notary: true,
    witness_count: 0,
    signature_roles: ["Settlor", "Trustee", "Notary (recommended)"],
    print_steps: [
      "Print the special-needs trust after attorney review.",
      "Sign per the Texas Trust Code (notarization recommended).",
      "Never name the disabled beneficiary directly on a will or beneficiary form instead of this trust.",
    ],
    badge: "Print · attorney-supervised",
  }),

  // ── Family ────────────────────────────────────────────────────────────────
  original_petition_divorce: court({
    signature_roles: ["Petitioner (verification)", "District clerk (filing)"],
    print_steps: [
      "Download the approved petition.",
      "Sign any verification block.",
      "File with the district clerk in the proper county; arrange service on the respondent.",
    ],
    badge: "File with clerk",
  }),
  waiver_or_answer: formalities({
    needs_notary: true,
    witness_count: 0,
    signature_roles: ["Respondent", "Notary (required for waiver of service)"],
    print_steps: [
      "Print the waiver or answer.",
      "A waiver of service must be signed before a notary AFTER the petition is on file.",
      "File the signed/notarized original with the district clerk under the cause number.",
    ],
    badge: "Print · notarize · file",
  }),
  final_decree_divorce: court({
    signature_roles: [
      "Petitioner (as to form and substance)",
      "Respondent (as to form and substance)",
      "Counsel (if any)",
      "Judge",
    ],
    print_steps: [
      "Review the agreed decree carefully.",
      "Both parties (and counsel, if any) sign as to form and substance where indicated.",
      "Submit to the court for the judge's signature — that signature ends the marriage.",
    ],
    badge: "Parties + judge sign",
  }),
  sapcr_petition: court({
    signature_roles: ["Petitioner (verification)", "District clerk (filing)"],
    print_steps: [
      "Sign any verification block on the SAPCR petition.",
      "File with the district clerk in the child's home county and arrange service.",
    ],
    badge: "File with clerk",
  }),
  proposed_parenting_plan: {
    ...ESIGN_DEFAULT,
    signature_roles: ["Parent 1", "Parent 2 (when agreed)"],
    badge: "Sign if agreed",
    print_steps: [
      "Review the parenting plan with the other parent or counsel.",
      "Sign when the terms are agreed; it is typically incorporated into a decree or SAPCR order.",
    ],
  },
  child_support_proposal: {
    ...ESIGN_DEFAULT,
    signature_roles: ["Proposing parent"],
    badge: "Sign if agreed",
    print_steps: [
      "Confirm the guideline worksheet numbers.",
      "Sign when exchanging with the other parent or counsel for incorporation into an order.",
    ],
  },
  premarital_agreement: formalities({
    needs_notary: true,
    witness_count: 0,
    signature_roles: ["Party 1", "Party 2", "Notary"],
    print_steps: [
      "Each party should have independent counsel review before signing.",
      "Print and sign before a notary.",
      "Each party keeps a fully signed original.",
    ],
    badge: "Print · both parties · notary",
  }),
  marital_property_agreement: formalities({
    needs_notary: true,
    witness_count: 0,
    signature_roles: ["Spouse 1", "Spouse 2", "Notary"],
    print_steps: [
      "Independent counsel for each spouse is strongly recommended.",
      "Print and sign before a notary.",
      "Keep fully executed originals with your estate / property records.",
    ],
    badge: "Print · both spouses · notary",
  }),
  motion_to_modify: court({
    signature_roles: ["Movant (verification)", "District clerk"],
    print_steps: [
      "Sign any verification.",
      "File under the existing cause number and arrange service on the other party.",
    ],
    badge: "File with clerk",
  }),
  motion_to_enforce: court({
    signature_roles: ["Movant (verification)", "District clerk"],
    print_steps: [
      "Sign any verification.",
      "File under the existing cause number and arrange service.",
    ],
    badge: "File with clerk",
  }),
  protective_order_application: court({
    signature_roles: ["Applicant (verification under oath)", "Court / clerk"],
    print_steps: [
      "This is safety-critical — follow your attorney's filing instructions exactly.",
      "Sign the application under oath as directed and file with the court.",
    ],
    badge: "File · attorney-supervised",
  }),
  petition_to_establish_parentage: court({
    signature_roles: ["Petitioner", "District clerk"],
    print_steps: [
      "Sign any verification.",
      "File with the district clerk and arrange service.",
    ],
    badge: "File with clerk",
  }),

  // ── Tax (Form 2848 is special) ────────────────────────────────────────────
  power_of_attorney_irs: formalities({
    needs_notary: false,
    witness_count: 0,
    signature_roles: ["Taxpayer", "Representative (CAF)", "IRS Form 2848 signature block"],
    print_steps: [
      "Use the IRS Form 2848 signature block exactly as printed — do not substitute a casual e-sign.",
      "Both taxpayer and representative must sign where indicated.",
      "File/fax per current IRS instructions for Form 2848.",
    ],
    badge: "IRS Form 2848 signatures",
  }),
  identity_theft_affidavit: formalities({
    needs_notary: false,
    witness_count: 0,
    signature_roles: ["Taxpayer (Form 14039 signature / penalty of perjury)"],
    print_steps: [
      "Complete IRS Form 14039 carefully.",
      "Sign under penalty of perjury where the form requires.",
      "Submit per the form instructions with supporting ID documentation.",
    ],
    badge: "Sign Form 14039",
  }),
};

/** Per-engine defaults, used when no instrument preset key is known. Keyed by
 *  InstrumentType rather than by instrument key — see INSTRUMENT_EXECUTION above,
 *  which is the more specific lookup and wins. */
const ENGINE_EXECUTION: Partial<Record<string, InstrumentExecution>> = {
  draft_contract: {
    ...ESIGN_DEFAULT,
    signature_roles: ["Party 1", "Party 2"],
    badge: "E-sign (all parties)",
    print_steps: [
      "Review the attorney-approved contract.",
      "Collect electronic signatures from every party (in-app or Dropbox Sign).",
      "Save the completed PDF/DOCX with the certificate of completion.",
    ],
  },
  draft_waiver: {
    ...ESIGN_DEFAULT,
    signature_roles: ["Releasor", "Releasee (if required)"],
    badge: "E-sign ready",
  },
  wills_trusts: INSTRUMENT_EXECUTION.last_will_testament,
  demand_letter: SEND_DEFAULT,
  complaint_letter: SEND_DEFAULT,
  general_document: SEND_DEFAULT,
  doc_review: SEND_DEFAULT,
};

const TITLE_HINTS: Array<{ re: RegExp; key: string }> = [
  { re: /\bwill and testament\b|\blast will\b|\bmy will\b/i, key: "last_will_testament" },
  { re: /\bcodicil\b/i, key: "codicil" },
  { re: /\bdurable power of attorney\b|\bfinancial poa\b/i, key: "statutory_durable_poa" },
  { re: /\bmedical power of attorney\b|\bhealth.?care (poa|agent)\b/i, key: "medical_power_of_attorney" },
  { re: /\bdirective to physicians\b|\bliving will\b/i, key: "directive_to_physicians" },
  { re: /\bdeclaration of guardian\b/i, key: "declaration_of_guardian" },
  { re: /\btransfer on death\b|\btodd\b/i, key: "transfer_on_death_deed" },
  { re: /\brevocable (living )?trust\b/i, key: "revocable_living_trust" },
  { re: /\bpour[- ]over will\b/i, key: "pour_over_will" },
  { re: /\bspecial needs trust\b|\bsupplemental needs\b/i, key: "special_needs_trust" },
  { re: /\bwaiver of service\b/i, key: "waiver_or_answer" },
  { re: /\bfinal decree\b|\bdivorce decree\b/i, key: "final_decree_divorce" },
  { re: /\bpremarital\b|\bprenup/i, key: "premarital_agreement" },
  { re: /\bpostnuptial\b|\bmarital property agreement\b|\bpartition.*exchange\b/i, key: "marital_property_agreement" },
  { re: /\bform 2848\b|\birs power of attorney\b/i, key: "power_of_attorney_irs" },
  { re: /\bform 14039\b|\bidentity theft affidavit\b/i, key: "identity_theft_affidavit" },
];

export interface ResolveExecutionInput {
  /** Instrument / plan key when known (content_json.plan_key or strategy key). */
  instrumentKey?: string | null;
  /** Document title for heuristic matching. */
  title?: string | null;
  /** Which drafting engine produced this document. */
  docType?: string | null;
}

/** Resolve execution metadata for a document or instrument. */
export function resolveExecution(input: ResolveExecutionInput): InstrumentExecution {
  const key = (input.instrumentKey ?? "").trim();
  if (key && INSTRUMENT_EXECUTION[key]) {
    return INSTRUMENT_EXECUTION[key];
  }

  const title = input.title ?? "";
  for (const hint of TITLE_HINTS) {
    if (hint.re.test(title) && INSTRUMENT_EXECUTION[hint.key]) {
      return INSTRUMENT_EXECUTION[hint.key];
    }
  }

  const docType = input.docType ?? "";
  if (docType && ENGINE_EXECUTION[docType]) {
    return ENGINE_EXECUTION[docType]!;
  }

  return SEND_DEFAULT;
}

export function isFormalitiesExecution(exec: InstrumentExecution): boolean {
  return exec.mode === "print_formalities";
}

export function isQuickSignExecution(exec: InstrumentExecution): boolean {
  return exec.esign_allowed && (exec.mode === "esign" || exec.mode === "send_only");
}

export function executionModeLabel(mode: ExecutionMode): string {
  switch (mode) {
    case "esign":
      return "Electronic signature";
    case "print_formalities":
      return "Print & execute (witnesses / notary)";
    case "send_only":
      return "Sign & send";
    case "court_signature":
      return "Court / clerk filing";
  }
}

/** Build a plain-text execution cover sheet for print packets. */
export function buildExecutionCoverSheet(opts: {
  documentTitle: string;
  execution: InstrumentExecution;
}): string {
  const { documentTitle, execution } = opts;
  const lines: string[] = [
    "EXECUTION PACKET — READ BEFORE YOU SIGN",
    "Crawford Law PLLC · Instant Attorney",
    "",
    `Document: ${documentTitle}`,
    `Execution type: ${executionModeLabel(execution.mode)}`,
    "",
    "Why this packet exists",
    execution.esign_allowed
      ? "This document can usually be signed electronically."
      : "This document needs formalities that a casual electronic signature cannot satisfy. Print it and follow the steps below — the signature lines tell you exactly who signs where.",
    "",
    "Steps",
    ...execution.print_steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Signature roles (look for these labeled blocks in the document)",
    ...execution.signature_roles.map((r) => `• ${r}`),
  ];

  if (execution.needs_notary) {
    lines.push("", "Notary: Required (or strongly required for a self-proving affidavit). Bring government ID.");
  }
  if (execution.witness_count > 0) {
    lines.push(
      "",
      `Witnesses: Bring ${execution.witness_count} qualified witness${execution.witness_count === 1 ? "" : "es"} who meet Texas requirements for this instrument.`
    );
  }
  if (execution.needs_recording) {
    lines.push("", "Recording: After notarization, record with the county clerk before the deed has any effect.");
  }

  lines.push(
    "",
    "Do not file, rely on, or treat as final any draft that still says it is unreviewed.",
    "If anything about these steps is unclear, message Crawford Law from your case file before you sign."
  );

  return lines.join("\n");
}
