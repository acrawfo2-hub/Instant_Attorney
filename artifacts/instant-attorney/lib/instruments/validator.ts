/** Deterministic, model-independent quality gate for generated legal instruments. */
export type ValidationSeverity = "error" | "warning";

export interface InstrumentValidationIssue {
  code: "MISSING_REQUIRED_SECTION" | "UNRESOLVED_BLOCKING_FACT" | "ABSENT_AUTHORITY_METADATA" |
    "INCONSISTENT_DEFINED_TERM" | "MISSING_EXECUTION_ROLE" | "OMITTED_EXHIBIT" | "UNMET_JURISDICTION_FORMALITY";
  severity: ValidationSeverity;
  message: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface InstrumentProfile {
  key: string;
  requiredSections: string[][];
  authorityRequired: boolean;
  signatureRoles: string[];
  acknowledgmentRoles?: string[];
  requiredExhibits?: string[];
  jurisdictionFormalities?: string[][];
}

export interface InstrumentValidationReport {
  version: 1;
  profile_key: string;
  validated_at: string;
  ready_for_attorney_review: boolean;
  errors: InstrumentValidationIssue[];
  warnings: InstrumentValidationIssue[];
}

const PROFILES: Record<string, InstrumentProfile> = {
  open_records_request: {
    key: "open_records_request", requiredSections: [["records requested", "request"], ["delivery", "format"], ["contact"]],
    authorityRequired: true, signatureRoles: ["requester"], jurisdictionFormalities: [["public information officer", "records custodian", "foia officer"]],
  },
  complaint: {
    key: "complaint", requiredSections: [["parties", "complainant"], ["facts", "factual allegations"], ["claims", "cause of action"], ["relief", "prayer"]],
    authorityRequired: true, signatureRoles: ["complainant"], jurisdictionFormalities: [["verification", "declaration"], ["certificate of service"]],
  },
  will: {
    key: "will", requiredSections: [["revocation"], ["beneficiar", "disposition"], ["executor"], ["residuary"]],
    authorityRequired: true, signatureRoles: ["testator", "witness"], acknowledgmentRoles: ["notary"], jurisdictionFormalities: [["self-proving", "self proving"]],
  },
  trust: {
    key: "trust", requiredSections: [["trust property", "trust estate"], ["trustee"], ["beneficiar"], ["distribution"], ["revocation", "amendment"]],
    authorityRequired: true, signatureRoles: ["settlor", "trustee"], acknowledgmentRoles: ["notary"], requiredExhibits: ["schedule a"], jurisdictionFormalities: [["governing law"]],
  },
  generic: { key: "generic", requiredSections: [["purpose", "agreement", "request"]], authorityRequired: false, signatureRoles: ["signature"] },
};

export function resolveInstrumentProfile(input: { wizardType?: string; instrument?: string; planKey?: string }): InstrumentProfile {
  const namedInstrument = `${input.planKey ?? ""} ${input.instrument ?? ""}`.toLowerCase();
  const value = `${namedInstrument} ${input.wizardType ?? ""}`.toLowerCase();
  if (/foia|open[ -]?records|public information/.test(value)) return PROFILES.open_records_request;
  if (/complaint|petition|charge/.test(value)) return PROFILES.complaint;
  if (/trust/.test(namedInstrument)) return PROFILES.trust;
  if (/will|testament/.test(value)) return PROFILES.will;
  return PROFILES.generic;
}

function includesAny(text: string, alternatives: string[]): boolean {
  return alternatives.some((term) => text.includes(term.toLowerCase()));
}

/** Compare a resolved profile with document text/metadata and the Living File. */
export function validateInstrument(args: {
  profile: InstrumentProfile;
  document: { text: string; authorityMetadata?: unknown; exhibits?: string[] };
  livingFile: { facts?: Array<{ description?: string; status?: string }>; jurisdiction?: string | null };
  now?: string;
}): InstrumentValidationReport {
  const text = args.document.text.toLowerCase();
  const issues: InstrumentValidationIssue[] = [];
  const add = (issue: InstrumentValidationIssue) => issues.push(issue);

  args.profile.requiredSections.forEach((names) => {
    if (!includesAny(text, names)) add({ code: "MISSING_REQUIRED_SECTION", severity: "error", message: `Missing required section: ${names[0]}.`, path: "document.text", details: { alternatives: names } });
  });
  const placeholders = [...args.document.text.matchAll(/\[\[([^\]]+)\]\]|\{\{([^}]+)\}\}|<([^>]+)>/g)].map((m) => m[1] || m[2] || m[3]);
  const blockingFacts = (args.livingFile.facts ?? []).filter((f) => f.status === "gap" || f.status === "needed" || f.status === "disputed").map((f) => f.description).filter(Boolean);
  if (placeholders.length || blockingFacts.length) add({ code: "UNRESOLVED_BLOCKING_FACT", severity: "error", message: "The instrument contains unresolved blocking facts.", path: "livingFile.facts", details: { placeholders, facts: blockingFacts } });
  if (args.profile.authorityRequired && !args.document.authorityMetadata) add({ code: "ABSENT_AUTHORITY_METADATA", severity: "error", message: "Required legal authority metadata is absent.", path: "document.authorityMetadata" });

  const defined = [...args.document.text.matchAll(/(?:“([^”]+)”|"([^"]+)")\s+(?:means|shall mean)/gi)].map((m) => (m[1] || m[2]).toLowerCase());
  const quoted = [...args.document.text.matchAll(/(?:“([^”]+)”|"([^"]+)")/g)].map((m) => (m[1] || m[2]).toLowerCase());
  const inconsistent = [...new Set(quoted.filter((term) => !defined.includes(term) && new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi").test(args.document.text)))];
  if (inconsistent.length) add({ code: "INCONSISTENT_DEFINED_TERM", severity: "warning", message: "Quoted terms are used without a matching definition.", path: "document.text", details: { terms: inconsistent } });

  for (const role of [...args.profile.signatureRoles, ...(args.profile.acknowledgmentRoles ?? [])]) {
    if (!text.includes(role.toLowerCase())) add({ code: "MISSING_EXECUTION_ROLE", severity: "error", message: `Missing signature or acknowledgment role: ${role}.`, path: "document.text", details: { role } });
  }
  for (const exhibit of args.profile.requiredExhibits ?? []) {
    const supplied = (args.document.exhibits ?? []).some((v) => v.toLowerCase().includes(exhibit)) || text.includes(exhibit);
    if (!supplied) add({ code: "OMITTED_EXHIBIT", severity: "error", message: `Required exhibit omitted: ${exhibit}.`, path: "document.exhibits", details: { exhibit } });
  }
  for (const alternatives of args.profile.jurisdictionFormalities ?? []) {
    if (!includesAny(text, alternatives)) add({ code: "UNMET_JURISDICTION_FORMALITY", severity: "error", message: `Jurisdiction-specific formality is not addressed: ${alternatives[0]}.`, path: "document.text", details: { alternatives, jurisdiction: args.livingFile.jurisdiction ?? null } });
  }
  const errors = issues.filter((i) => i.severity === "error");
  return { version: 1, profile_key: args.profile.key, validated_at: args.now ?? new Date().toISOString(), ready_for_attorney_review: errors.length === 0, errors, warnings: issues.filter((i) => i.severity === "warning") };
}
