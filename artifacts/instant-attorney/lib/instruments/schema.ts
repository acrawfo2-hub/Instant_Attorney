import type { WizardType } from "../types.ts";

export type InstrumentRiskLevel = "low" | "moderate" | "high";

export interface ConditionalQuestion {
  when: string;
  ask: string;
}

/** A durable, engine-independent specification for one legal instrument. */
export interface InstrumentProfile {
  instrument_key: string;
  title: string;
  engine: WizardType;
  required_facts: readonly string[];
  conditional_questions: readonly ConditionalQuestion[];
  required_sections: readonly string[];
  optional_sections: readonly string[];
  prohibited_assumptions: readonly string[];
  execution_or_filing_rules: readonly string[];
  companion_documents: readonly string[];
  authority_references: readonly string[];
  risk_level: InstrumentRiskLevel;
  output_profile: {
    format: string;
    tone: string;
    review_notes: readonly string[];
  };
}

export function defineInstrumentProfile<const T extends InstrumentProfile>(profile: T): T {
  return Object.freeze(profile);
}
