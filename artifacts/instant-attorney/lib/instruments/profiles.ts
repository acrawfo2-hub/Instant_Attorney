import { defineInstrumentProfile } from "./schema.ts";

export const BUSINESS_LETTER = defineInstrumentProfile({
  instrument_key: "business_letter", title: "Business Letter", engine: "general_document",
  required_facts: ["sender identity and address", "recipient identity and address", "purpose", "material facts and dates", "requested response"],
  conditional_questions: [{ when: "a response is requested", ask: "What is a reasonable response date?" }],
  required_sections: ["date and address block", "subject", "body", "closing and signature"], optional_sections: ["enclosures", "copy recipients"],
  prohibited_assumptions: ["Do not imply legal claims, authority, or deadlines not supplied."], execution_or_filing_rules: ["Confirm delivery method; no filing is presumed."],
  companion_documents: ["referenced enclosures"], authority_references: ["Applicable contract or correspondence policy, if identified"], risk_level: "low",
  output_profile: { format: "business correspondence", tone: "clear, concise, professional", review_notes: ["Preserve a human-readable subject and title."] },
});

export const FEDERAL_FOIA_REQUEST = defineInstrumentProfile({
  instrument_key: "federal_foia_request", title: "Federal FOIA Request", engine: "general_document",
  required_facts: ["requester contact information", "federal agency/component", "records description", "date range", "preferred production format", "fee category and ceiling"],
  conditional_questions: [{ when: "expedited processing may apply", ask: "What facts support an urgent need?" }, { when: "a fee waiver is requested", ask: "How will disclosure contribute to public understanding?" }],
  required_sections: ["request under FOIA", "records sought", "search instructions", "format", "fees", "response and appeal rights"], optional_sections: ["expedited-processing request", "fee-waiver request", "privacy authorization"],
  prohibited_assumptions: ["Do not assume a fee waiver, expedited treatment, or requester category."], execution_or_filing_rules: ["Send to the agency component by its accepted portal, email, or address.", "Track the agency request number and statutory response period."],
  companion_documents: ["identity certification or authorization when records concern an individual"], authority_references: ["5 U.S.C. § 552", "Agency FOIA regulations"], risk_level: "moderate",
  output_profile: { format: "agency request letter", tone: "specific and cooperative", review_notes: ["Describe records, not interrogatories."] },
});

export const TEXAS_PUBLIC_INFORMATION_REQUEST = defineInstrumentProfile({
  instrument_key: "texas_public_information_request", title: "Texas Public Information Request", engine: "general_document",
  required_facts: ["requester contact information", "Texas governmental body", "records description", "date range", "delivery format"],
  conditional_questions: [{ when: "estimated charges may exceed the requester's limit", ask: "What maximum charge will the requester authorize?" }],
  required_sections: ["request under the Texas Public Information Act", "records sought", "format and delivery", "cost notice request"], optional_sections: ["inspection request", "narrowing instructions"],
  prohibited_assumptions: ["Do not label the request FOIA or assume the body possesses particular records."], execution_or_filing_rules: ["Submit to the governmental body's designated public-information officer or accepted channel.", "Preserve proof and date of receipt."],
  companion_documents: ["cost authorization or clarification response"], authority_references: ["Texas Government Code Chapter 552", "1 Tex. Admin. Code Chapter 70"], risk_level: "moderate",
  output_profile: { format: "Texas governmental-records request", tone: "precise and nonargumentative", review_notes: ["Use Texas PIA terminology."] },
});

export const CIVIL_COMPLAINT_PETITION = defineInstrumentProfile({
  instrument_key: "civil_complaint_petition", title: "Civil Complaint or Petition", engine: "general_document",
  required_facts: ["court and jurisdiction", "all parties and capacities", "venue facts", "chronology", "each claim and element", "injury and relief", "limitations and service information"],
  conditional_questions: [{ when: "jury trial is desired", ask: "Should the pleading include a jury demand and fee?" }, { when: "verified pleading is required", ask: "Who can swear to which facts?" }],
  required_sections: ["caption", "parties", "jurisdiction and venue", "facts", "causes of action", "prayer", "signature and service information"], optional_sections: ["jury demand", "verification", "exhibits", "temporary relief"],
  prohibited_assumptions: ["Do not invent jurisdiction, elements, damages, service facts, or verification."], execution_or_filing_rules: ["Confirm court-specific rules, limitations, filing fee, service, redaction, and e-filing requirements before filing."],
  companion_documents: ["civil cover sheet", "summons or citation", "exhibits", "proposed order for temporary relief"], authority_references: ["Applicable rules of civil procedure", "Court local rules", "Substantive authorities for each pleaded claim"], risk_level: "high",
  output_profile: { format: "court pleading", tone: "fact-specific and rule-compliant", review_notes: ["Attorney review is required before filing."] },
});

export const INDIVIDUAL_WILL = defineInstrumentProfile({
  instrument_key: "individual_will", title: "Individual Will", engine: "wills_trusts",
  required_facts: ["testator identity, domicile, and capacity", "family and beneficiary relationships", "specific gifts", "residuary disposition", "executor and alternates", "minor-child guardian wishes"],
  conditional_questions: [{ when: "a beneficiary may predecease", ask: "Should that gift lapse, pass to descendants, or pass elsewhere?" }, { when: "minor beneficiaries exist", ask: "At what ages and through what custodian or trust should they receive property?" }],
  required_sections: ["declarations", "revocation", "debts and expenses", "gifts", "residue", "fiduciary appointments", "powers", "execution"], optional_sections: ["specific gifts", "testamentary trusts", "digital assets", "no-contest clause"],
  prohibited_assumptions: ["Do not assume marital status, descendants, survivorship plan, tax plan, or beneficiary capacity."], execution_or_filing_rules: ["Apply the governing state's witness, signature, attestation, and self-proving requirements.", "Do not treat a draft as executed until formalities are completed."],
  companion_documents: ["self-proving affidavit", "tangible-personal-property memorandum", "powers of attorney", "advance directive"], authority_references: ["Governing state probate and estates code"], risk_level: "high",
  output_profile: { format: "execution-ready estate-planning instrument", tone: "unambiguous and formal", review_notes: ["Include a separate execution checklist."] },
});

export const REVOCABLE_TRUST = defineInstrumentProfile({
  instrument_key: "revocable_trust", title: "Revocable Trust", engine: "wills_trusts",
  required_facts: ["settlor identity and domicile", "initial and successor trustees", "beneficiaries", "lifetime distributions", "death distributions", "incapacity standard", "assets intended for funding"],
  conditional_questions: [{ when: "beneficiaries are minors or need protection", ask: "What ages, standards, and trustee discretion should govern distributions?" }, { when: "real property will be funded", ask: "Where is it located and how is it titled?" }],
  required_sections: ["creation and revocability", "trust property", "administration during capacity and incapacity", "trustee succession and powers", "death administration", "distributions", "governing law", "execution"], optional_sections: ["specific subtrusts", "trust protector", "digital assets", "special tax provisions"],
  prohibited_assumptions: ["Do not assume assets transfer automatically, tax outcomes, incapacity, or beneficiary needs."], execution_or_filing_rules: ["Execute under governing law and applicable notarization rules.", "Prepare and complete asset-specific funding; an unfunded trust does not control omitted assets."],
  companion_documents: ["pour-over will", "certificate or memorandum of trust", "assignment of personal property", "asset-specific deeds and beneficiary changes"], authority_references: ["Governing state trust code", "Asset-specific transfer rules"], risk_level: "high",
  output_profile: { format: "estate-planning trust agreement", tone: "formal and operational", review_notes: ["Always provide a funding schedule and execution checklist."] },
});
