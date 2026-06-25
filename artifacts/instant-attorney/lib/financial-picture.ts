// ── Financial Picture — core logic ───────────────────────────────────────────
//
// Milestone 1 of docs/financial-picture-spec.md. Pure, testable helpers over the
// structured financial_items model: the option catalogs the UI renders, the
// client-facing FINANCIAL DISCLOSURE STANDARD shown up front, deterministic
// roll-ups (the LLM never does this math), input validation, and the partner-
// relationship guard that caps how far a partner's reported asset can be trusted.
//
// General information, not legal advice.

import type {
  FinancialItem,
  FinancialCategory,
  FinancialOwner,
  Characterization,
  ExemptStatus,
  ValueBasis,
  VerificationStatus,
  PartnerRole,
  RepresentationScope,
} from "./types.ts";

// ── Option catalogs (labels for the UI + display) ───────────────────────────
export const CATEGORY_OPTIONS: { value: FinancialCategory; label: string; kind: "asset" | "debt" | "income" | "expense" }[] = [
  { value: "real_property", label: "Real estate / home", kind: "asset" },
  { value: "vehicle", label: "Vehicle", kind: "asset" },
  { value: "financial_account", label: "Bank / brokerage account", kind: "asset" },
  { value: "retirement_account", label: "Retirement account", kind: "asset" },
  { value: "business_interest", label: "Business interest", kind: "asset" },
  { value: "personal_property", label: "Personal property", kind: "asset" },
  { value: "life_insurance", label: "Life insurance (cash value)", kind: "asset" },
  { value: "receivable", label: "Money owed to you", kind: "asset" },
  { value: "secured_debt", label: "Secured debt (mortgage / auto loan)", kind: "debt" },
  { value: "unsecured_debt", label: "Unsecured debt (cards / medical)", kind: "debt" },
  { value: "income_source", label: "Income source", kind: "income" },
  { value: "recurring_expense", label: "Recurring expense", kind: "expense" },
];

export const OWNER_OPTIONS: { value: FinancialOwner; label: string }[] = [
  { value: "client", label: "Mine" },
  { value: "joint", label: "Joint (both of us)" },
  { value: "partner", label: "My spouse / partner's" },
  { value: "other_third_party", label: "Someone else's" },
];

export const CHARACTERIZATION_OPTIONS: { value: Characterization; label: string }[] = [
  { value: "community", label: "Community (acquired during marriage)" },
  { value: "separate_client", label: "My separate property" },
  { value: "separate_partner", label: "Partner's separate property" },
  { value: "mixed_or_unknown", label: "Mixed / not sure" },
  { value: "not_applicable", label: "Not applicable" },
];

export const EXEMPT_OPTIONS: { value: ExemptStatus; label: string }[] = [
  { value: "exempt", label: "Exempt" },
  { value: "non_exempt", label: "Non-exempt" },
  { value: "partial", label: "Partially exempt" },
  { value: "unknown", label: "Not sure" },
  { value: "not_applicable", label: "Not applicable" },
];

export const VALUE_BASIS_OPTIONS: { value: ValueBasis; label: string }[] = [
  { value: "client_estimate", label: "My estimate" },
  { value: "account_statement", label: "Account statement" },
  { value: "appraisal", label: "Appraisal" },
  { value: "tax_assessment", label: "Tax assessment" },
  { value: "contract_or_title", label: "Contract / title / deed" },
  { value: "other_document", label: "Other document" },
];

const CATEGORY_KIND = new Map(CATEGORY_OPTIONS.map((o) => [o.value, o.kind]));
export function categoryKind(c: FinancialCategory): "asset" | "debt" | "income" | "expense" {
  return CATEGORY_KIND.get(c) ?? "asset";
}
export const labelFor = {
  category: (v: FinancialCategory) => CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? v,
  owner: (v: FinancialOwner) => OWNER_OPTIONS.find((o) => o.value === v)?.label ?? v,
  characterization: (v: Characterization) => CHARACTERIZATION_OPTIONS.find((o) => o.value === v)?.label ?? v,
  exempt: (v: ExemptStatus) => EXEMPT_OPTIONS.find((o) => o.value === v)?.label ?? v,
  valueBasis: (v: ValueBasis) => VALUE_BASIS_OPTIONS.find((o) => o.value === v)?.label ?? v,
};

// ── The client-facing disclosure standard (shown up front, click-to-ack) ─────
export const FINANCIAL_DISCLOSURE_VERSION = "1.0-draft";

export const FINANCIAL_DISCLOSURE_STANDARD = {
  version: FINANCIAL_DISCLOSURE_VERSION,
  title: "Before we map your finances — how this works",
  intro:
    "To give you accurate guidance on assets, debts, and property, we need a complete and honest financial picture. Please read this first — it protects you.",
  points: [
    {
      heading: "Full, honest disclosure is required — and it protects you",
      body:
        "In bankruptcy and in family-law cases, the law requires you to disclose all of your assets, debts, and income — often in documents you sign under oath. Leaving things out or understating values isn't a shortcut; it's the fastest way to lose your case, face sanctions, or worse.",
    },
    {
      heading: "We cannot help hide, move, or undervalue assets",
      body:
        "We can't prepare anything that omits an asset, understates a value, or disguises a transfer. Hiding assets in bankruptcy is a federal crime, transfers made to dodge creditors get unwound, and concealment in a divorce draws court sanctions. If something worries you, tell us — there are almost always lawful options.",
    },
    {
      heading: "Estimates are fine to start — we'll verify before anything is filed",
      body:
        "Give us your best estimates now; we'll mark them as estimates. Before you ever sign a sworn document, an attorney verifies the numbers against your records. Nothing is treated as final until then.",
    },
    {
      heading: "Your partner's information",
      body:
        "Tell us what you know about a spouse or partner's finances, but we'll record it as your report — not as verified fact. If they're on the other side of a divorce, the confirmed numbers come through the formal court process, not a guess.",
    },
    {
      heading: "Privacy & privilege",
      body:
        "This conversation is privileged and confidential, and we collect only what your matter needs. Privilege protects honest legal help — it does not cover using a lawyer to commit or cover up fraud.",
    },
  ],
  acknowledgment:
    "I understand I need to disclose my finances fully and honestly, that estimates are okay to start and will be verified before any sworn filing, and that the firm cannot help conceal or misstate assets.",
};

// ── Interval (range) arithmetic — deterministic, never the LLM ───────────────
export interface Range {
  low: number;
  high: number;
}
const ZERO: Range = { low: 0, high: 0 };
const n = (v: number | null | undefined): number => (typeof v === "number" && isFinite(v) ? v : 0);
const itemRange = (it: FinancialItem): Range => ({ low: n(it.value_low), high: Math.max(n(it.value_low), n(it.value_high)) });
const addR = (a: Range, b: Range): Range => ({ low: a.low + b.low, high: a.high + b.high });
const subR = (a: Range, b: Range): Range => ({ low: a.low - b.high, high: a.high - b.low });

export interface FinancialSummary {
  assets: Range;
  debts: Range;
  net: Range;
  income: Range;
  expenses: Range;
  /** Asset totals by community-property characterization (family-law view). */
  byCharacterization: Record<Characterization, Range>;
  counts: { total: number; byOwner: Record<FinancialOwner, number> };
  verification: {
    asserted: number;
    docSupported: number;
    attorneyVerified: number;
    /** 0–100, share of value-bearing items that are at least document-supported. */
    percentSupported: number;
  };
  needsReviewCount: number;
  redFlagCount: number;
}

const emptyByChar = (): Record<Characterization, Range> => ({
  community: { ...ZERO },
  separate_client: { ...ZERO },
  separate_partner: { ...ZERO },
  mixed_or_unknown: { ...ZERO },
  not_applicable: { ...ZERO },
});
const emptyByOwner = (): Record<FinancialOwner, number> => ({
  client: 0,
  joint: 0,
  partner: 0,
  other_third_party: 0,
});

/**
 * Deterministic roll-up over the active items. Pure — the source of truth for
 * every total the UI or a document shows. Estimates stay as ranges.
 */
export function summarizeFinancialPicture(items: FinancialItem[]): FinancialSummary {
  const active = items.filter((it) => it.status === "active");

  let assets: Range = { ...ZERO };
  let debts: Range = { ...ZERO };
  let income: Range = { ...ZERO };
  let expenses: Range = { ...ZERO };
  const byCharacterization = emptyByChar();
  const byOwner = emptyByOwner();
  let asserted = 0;
  let docSupported = 0;
  let attorneyVerified = 0;
  let needsReviewCount = 0;
  let redFlagCount = 0;

  for (const it of active) {
    const r = itemRange(it);
    const kind = categoryKind(it.category);
    if (kind === "asset") {
      assets = addR(assets, r);
      byCharacterization[it.characterization] = addR(byCharacterization[it.characterization], r);
    } else if (kind === "debt") {
      debts = addR(debts, r);
    } else if (kind === "income") {
      income = addR(income, r);
    } else {
      expenses = addR(expenses, r);
    }

    byOwner[it.owner] = (byOwner[it.owner] ?? 0) + 1;
    if (it.verification_status === "attorney_verified") attorneyVerified++;
    else if (it.verification_status === "doc_supported") docSupported++;
    else asserted++;
    if (it.needs_attorney_review) needsReviewCount++;
    redFlagCount += Array.isArray(it.red_flags) ? it.red_flags.length : 0;
  }

  const supported = docSupported + attorneyVerified;
  const denom = asserted + docSupported + attorneyVerified;
  const percentSupported = denom === 0 ? 0 : Math.round((supported / denom) * 100);

  return {
    assets,
    debts,
    net: subR(assets, debts),
    income,
    expenses,
    byCharacterization,
    counts: { total: active.length, byOwner },
    verification: { asserted, docSupported, attorneyVerified, percentSupported },
    needsReviewCount,
    redFlagCount,
  };
}

// ── Partner-relationship guard ───────────────────────────────────────────────
// A partner who is the adverse party (family law) or a non-client third party
// has not consented and owes us no records — so anything the CLIENT reports about
// their assets can never rise above "unverified" from client input alone.
export function partnerReportOnly(partnerRole: PartnerRole | undefined): boolean {
  return partnerRole === "adverse_party" || partnerRole === "non_client_third_party";
}

/**
 * The highest verification an item may carry given who owns it and our
 * relationship to that person. Used to guard the data and shape the UI.
 */
export function maxVerificationFor(owner: FinancialOwner, partnerRole: PartnerRole | undefined): VerificationStatus {
  if ((owner === "partner" || owner === "other_third_party") && partnerReportOnly(partnerRole)) {
    return "unverified";
  }
  return "attorney_verified";
}

const VERIFICATION_RANK: Record<VerificationStatus, number> = {
  unverified: 0,
  doc_supported: 1,
  attorney_verified: 2,
};
export function verificationExceedsCeiling(
  status: VerificationStatus,
  owner: FinancialOwner,
  partnerRole: PartnerRole | undefined
): boolean {
  return VERIFICATION_RANK[status] > VERIFICATION_RANK[maxVerificationFor(owner, partnerRole)];
}

// ── Validation ───────────────────────────────────────────────────────────────
export interface FinancialItemInput {
  category?: unknown;
  label?: unknown;
  owner?: unknown;
  value_low?: unknown;
  value_high?: unknown;
  valued_as_of?: unknown;
}

const CATEGORY_SET = new Set(CATEGORY_OPTIONS.map((o) => o.value));
const OWNER_SET = new Set(OWNER_OPTIONS.map((o) => o.value));

/** Returns a list of human-readable errors; empty array means valid. */
export function validateFinancialItemInput(input: FinancialItemInput): string[] {
  const errors: string[] = [];

  if (typeof input.category !== "string" || !CATEGORY_SET.has(input.category as FinancialCategory)) {
    errors.push("Choose what kind of item this is.");
  }
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label) errors.push("Add a short description.");
  if (label.length > 160) errors.push("That description is too long.");
  if (input.owner !== undefined && !OWNER_SET.has(input.owner as FinancialOwner)) {
    errors.push("Choose who this belongs to.");
  }

  const lowGiven = input.value_low !== undefined && input.value_low !== null && input.value_low !== "";
  const highGiven = input.value_high !== undefined && input.value_high !== null && input.value_high !== "";
  const low = lowGiven ? Number(input.value_low) : null;
  const high = highGiven ? Number(input.value_high) : null;
  if (lowGiven && (!isFinite(low!) || low! < 0)) errors.push("Low value must be a number that isn't negative.");
  if (highGiven && (!isFinite(high!) || high! < 0)) errors.push("High value must be a number that isn't negative.");
  if (low != null && high != null && isFinite(low) && isFinite(high) && low > high) {
    errors.push("The low value can't be greater than the high value.");
  }
  if (typeof input.valued_as_of === "string" && input.valued_as_of && isNaN(Date.parse(input.valued_as_of))) {
    errors.push("The valuation date isn't a valid date.");
  }

  return errors;
}

// ── Representation context helpers ───────────────────────────────────────────
/** Family-law matters: the partner is adverse and can never be a joint client. */
export function allowedPartnerRoles(isFamilyLaw: boolean): PartnerRole[] {
  return isFamilyLaw
    ? ["none", "adverse_party", "non_client_third_party"]
    : ["none", "adverse_party", "joint_client", "non_client_third_party"];
}

/** Joint representation of both spouses requires a no-secrets acknowledgment. */
export function requiresNoSecretsAck(scope: RepresentationScope, partnerRole: PartnerRole): boolean {
  return scope === "joint_spouses" || partnerRole === "joint_client";
}
