import type { InstrumentType } from "../types.ts";
import type { InstrumentProfile } from "./schema.ts";
import { BUSINESS_LETTER, CIVIL_COMPLAINT_PETITION, FEDERAL_FOIA_REQUEST, INDIVIDUAL_WILL, REVOCABLE_TRUST, TEXAS_PUBLIC_INFORMATION_REQUEST } from "./profiles.ts";

export * from "./schema.ts";
export * from "./profiles.ts";

export const INSTRUMENT_PROFILES = [BUSINESS_LETTER, FEDERAL_FOIA_REQUEST, TEXAS_PUBLIC_INFORMATION_REQUEST, CIVIL_COMPLAINT_PETITION, INDIVIDUAL_WILL, REVOCABLE_TRUST] as const;
const byKey = new Map<string, InstrumentProfile>(INSTRUMENT_PROFILES.map((profile) => [profile.instrument_key, profile]));

export function resolveInstrumentProfile(instrumentKey?: string | null): InstrumentProfile | undefined {
  return instrumentKey ? byKey.get(instrumentKey) : undefined;
}

export function inferInstrumentKey(title: string, engine?: InstrumentType): string {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const known = INSTRUMENT_PROFILES.find((profile) => profile.instrument_key === normalized || profile.title.toLowerCase() === title.trim().toLowerCase());
  return known && (!engine || known.engine === engine) ? known.instrument_key : normalized || "custom_document";
}

export function instrumentGuidance(profile: InstrumentProfile): string {
  const list = (label: string, values: readonly string[]) => `${label}: ${values.join("; ")}.`;
  return [
    `Resolved instrument profile: ${profile.title} (${profile.instrument_key}); risk: ${profile.risk_level}.`,
    list("Required facts", profile.required_facts),
    `Conditional questions: ${profile.conditional_questions.map((q) => `When ${q.when}, ask: ${q.ask}`).join(" ")}`,
    list("Required sections", profile.required_sections), list("Optional sections", profile.optional_sections),
    list("Prohibited assumptions", profile.prohibited_assumptions), list("Execution or filing rules", profile.execution_or_filing_rules),
    list("Companion documents", profile.companion_documents), list("Authority references", profile.authority_references),
    `Output: ${profile.output_profile.format}; tone: ${profile.output_profile.tone}; ${profile.output_profile.review_notes.join(" ")}`,
  ].join("\n");
}
