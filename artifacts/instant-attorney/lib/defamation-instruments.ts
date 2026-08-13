// ── Defamation instrument presets ────────────────────────────────────────────
//
// The documents a defamation matter actually needs — a statutory retraction
// request, a cease-and-desist to the speaker, an evidence-preservation letter, a
// platform report, and (only when warranted) a petition — defined as PRESETS over
// existing instrument types (no new DocType / DB enum). Mirrors lib/debt-instruments.ts.
//
// `relevant_statutes` reference keys in lib/defamation-statutes.ts; a cross-check
// test asserts every referenced key resolves.

import type { InstrumentType } from "./types.ts";
import { matchDefamationStatutesByText, type DefamationStatuteKey } from "./defamation-statutes.ts";

export interface DefamationInstrument {
  key: string;
  label: string;
  purpose: string;
  engine: InstrumentType;
  recipient_guidance: string;
  required_fields: string[];
  relevant_statutes: DefamationStatuteKey[];
  default_response_days: number | null;
  /** True for high-stakes / risk-laden instruments (e.g. a suit with anti-SLAPP exposure). */
  high_stakes: boolean;
  triggers: string[];
}

export const DEFAMATION_INSTRUMENTS: DefamationInstrument[] = [
  {
    key: "retraction_request",
    label: "Retraction / Correction Request (Defamation Mitigation Act)",
    purpose:
      "Make a timely, sufficient written request under the Texas Defamation Mitigation Act that the publisher correct, clarify, or retract the false statement — preserving your right to exemplary damages and often getting it taken down.",
    engine: "general_document",
    recipient_guidance:
      "Send to the person or outlet that published the statement, by a method that proves delivery, within the one-year limitations period. Identify the statement specifically and state why it is false.",
    required_fields: [
      "Your name and contact information",
      "The publisher's name and address",
      "The exact statement, where and when it was published (URL/screenshot, date)",
      "A clear explanation of the statement(s) of fact alleged to be false",
      "The correction, clarification, or retraction requested",
    ],
    relevant_statutes: ["tx-defamation-mitigation-act", "tx-defamation-limitations"],
    default_response_days: 30,
    high_stakes: false,
    triggers: ["retraction", "correction", "take it down", "make them delete", "demand removal", "ask them to fix it"],
  },
  {
    key: "preservation_letter",
    label: "Evidence-Preservation Letter / Checklist",
    purpose:
      "Preserve the evidence before it disappears — capture the statement, its URL, dates, and audience, and (where appropriate) put a publisher on notice to preserve records.",
    engine: "general_document",
    recipient_guidance:
      "Primarily for your own records: screenshot and archive everything now. Where a platform or publisher is on notice, a preservation letter asks them to retain relevant data.",
    required_fields: [
      "The statement(s) verbatim, with URL(s) and the date(s) seen",
      "Who published it and on what platform",
      "Who saw it (audience/reach), and any witnesses",
      "Any harm you've experienced (lost job, clients, etc.) with dates",
    ],
    relevant_statutes: ["tx-libel-elements", "us-section-230"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["preserve evidence", "screenshot", "before they delete", "save the post", "document it"],
  },
  {
    key: "cease_and_desist_defamation",
    label: "Cease-and-Desist / Demand to the Speaker",
    purpose:
      "Demand that the speaker stop repeating the false statement and remove it, asserting your claims and a deadline — without overreaching in a way that invites an anti-SLAPP response.",
    engine: "demand_letter",
    recipient_guidance:
      "Send to the individual who made the statement (not the platform, which is generally immune). Keep it factual and measured; an aggressive letter over public-concern speech can provoke an anti-SLAPP motion.",
    required_fields: [
      "Your name and address",
      "The speaker's name and address",
      "The false statement(s), where/when published, and why they are false",
      "The demand (stop repeating; remove) and a response deadline",
      "Reservation of legal rights",
    ],
    relevant_statutes: ["tx-libel-elements", "tx-defamation-per-se", "tx-tcpa-anti-slapp"],
    default_response_days: 14,
    high_stakes: false,
    triggers: ["cease and desist", "demand letter", "make them stop", "stop saying", "warn them"],
  },
  {
    key: "platform_report_request",
    label: "Platform Report / Takedown Request",
    purpose:
      "Report the content to the platform under its own defamation/harassment policy to seek removal — the practical route when the platform itself is immune from suit.",
    engine: "general_document",
    recipient_guidance:
      "Submit through the platform's reporting/defamation form (e.g., Google, Meta, Yelp). The platform isn't liable under § 230, but most have policies to remove defamatory or policy-violating content.",
    required_fields: [
      "The platform and the specific content (URL, username/handle, post date)",
      "Why it violates the platform's policy and is false",
      "Your identity/verification as the subject, if required",
      "The removal requested",
    ],
    relevant_statutes: ["us-section-230"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["report to facebook", "report the post", "takedown", "flag the content", "report to google", "report the review"],
  },
  {
    key: "defamation_petition",
    label: "Defamation Petition (Filing Suit)",
    purpose:
      "Draft an original petition for defamation when a suit is warranted — pleading the false statement of fact, publication, identification, fault, and damages.",
    engine: "general_document",
    recipient_guidance:
      "Filed with the district court; the defendant is served. TIME-SENSITIVE (one-year deadline) and RISK-LADEN — assess the anti-SLAPP exposure first, because losing an early TCPA motion can shift the defendant's attorney's fees to you.",
    required_fields: [
      "Plaintiff and defendant names and residences",
      "The exact statement(s), publication date(s), and where published",
      "Why each statement is a false statement of fact (not opinion) and is about the plaintiff",
      "Plaintiff's status (private vs. public figure) and the fault alleged",
      "Damages (and any per-se category) and the relief requested",
    ],
    relevant_statutes: ["tx-libel-elements", "tx-defamation-per-se", "tx-defamation-limitations", "tx-tcpa-anti-slapp", "actual-malice-public-figure"],
    default_response_days: null,
    high_stakes: true,
    triggers: ["file a lawsuit", "sue for defamation", "take them to court", "defamation suit", "file suit"],
  },
];

export type DefamationInstrumentKey = (typeof DEFAMATION_INSTRUMENTS)[number]["key"];

const BY_KEY = new Map(DEFAMATION_INSTRUMENTS.map((i) => [i.key, i]));

export function getDefamationInstrument(key: string): DefamationInstrument | undefined {
  return BY_KEY.get(key);
}

export function isKnownDefamationInstrumentKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact catalog for injection into the intake system prompt. */
export function defamationInstrumentsForPrompt(): string {
  return DEFAMATION_INSTRUMENTS.map(
    (i) =>
      `• ${i.key} (drafts via ${i.engine})${i.high_stakes ? " [HIGH-STAKES — anti-SLAPP risk, recommend consult]" : ""} — ${i.label}: ${i.purpose}`
  ).join("\n");
}

/** Field-hint text for the drafter, shaped like INSTRUMENT_FIELD_HINTS entries. */
export function defamationInstrumentFieldHint(key: string): string | null {
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
export function matchDefamationInstrumentsByText(text: string): DefamationInstrument[] {
  const haystack = text.toLowerCase();
  return DEFAMATION_INSTRUMENTS.filter((i) => i.triggers.some((t) => haystack.includes(t.toLowerCase())));
}

// Short, single-concept terms a defamation matter is described by, so a terse
// matter_subtype like "defamation" is detected even though the instrument/statute
// triggers are multi-word phrases.
const DEFAMATION_CORE_TERMS = [
  "defamation",
  "defamatory",
  "libel",
  "slander",
  "reputation",
  "false statement",
  "false accusation",
  "lied about me",
  "spread lies",
  "online review",
  "bad review",
  "fake review",
  "smear",
  "false rumor",
];

/**
 * Whether free text (e.g. a case's matter subtype + summary) looks like a
 * defamation matter. Combines core terms with the instrument and statute keyword
 * matchers so both terse subtypes and richer summaries are caught.
 */
export function looksLikeDefamationMatter(text: string | null | undefined): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  if (DEFAMATION_CORE_TERMS.some((t) => haystack.includes(t))) return true;
  if (matchDefamationInstrumentsByText(haystack).length > 0) return true;
  return matchDefamationStatutesByText(haystack).length > 0;
}
