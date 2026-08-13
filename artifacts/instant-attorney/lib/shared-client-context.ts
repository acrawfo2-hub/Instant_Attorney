export interface ReusableClientFact {
  sourceCaseId: string;
  sourceCaseTitle: string;
  description: string;
}

// Deliberately narrow. Cross-file context is a convenience, never a second
// Living File: only stable identity/contact facts may be offered for reuse.
// Matter facts (dates, money, allegations, parties, strategy) stay isolated.
const REUSABLE_PATTERNS = [
  /\b(home|mailing|residential|street) address\b/i,
  /\b(date of birth|birth date|dob)\b/i,
  /\b(phone|telephone|mobile) (number|is)\b/i,
  /\b(email address|email is)\b/i,
  /\b(full legal name|legal name is)\b/i,
  /\b(marital status)\b/i,
];

const NEVER_REUSE_PATTERNS = [
  /\b(hypothetical|what-if|estimate|approximately|about \$)\b/i,
  /\b(deadline|incident|accident|injur|claim|debt|income|asset|custody|opposing|defendant|plaintiff)\b/i,
];

export function isReusableClientFact(fact: { description: string; status: string; kind?: string | null }): boolean {
  if (fact.status !== "confirmed" || fact.kind === "hypothetical") return false;
  if (NEVER_REUSE_PATTERNS.some((pattern) => pattern.test(fact.description))) return false;
  return REUSABLE_PATTERNS.some((pattern) => pattern.test(fact.description));
}

export function formatReusableClientContext(facts: ReusableClientFact[]): string {
  if (!facts.length) return "";
  return [
    "=== POSSIBLY REUSABLE CLIENT DETAILS FROM OTHER FILES ===",
    "These are confirmed details from this same client's other case files. They are NOT facts in the current file.",
    "Use them only to avoid making the client repeat stable identity/contact information. Briefly ask whether a detail is still current and relevant before relying on it or offering to save it here with record_fact.",
    "Never copy automatically. Never treat their presence as evidence that the matters are legally connected. Never mention or import case-specific facts, strategy, parties, dates, money, allegations, documents, or deadlines.",
    ...facts.map((fact) => `- From “${fact.sourceCaseTitle}”: ${fact.description}`),
  ].join("\n");
}
