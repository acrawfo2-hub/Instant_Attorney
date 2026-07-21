/**
 * Jurisdiction lanes for Instant Attorney.
 *
 * Full product depth (Texas statutes, calculators, drafting posture) is currently
 * built for Texas matters only. Crawford Law PLLC's responsible attorney is also
 * licensed in Illinois, but IL matters use Local Counsel Prep mode until an IL
 * depth lane is built.
 *
 * Prep mode (every non-TX US state + outside US): organize facts, timelines, and
 * questions for a locally licensed attorney — not state-specific legal advice.
 */

export const FULL_DEPTH_STATES = ["TX"] as const;
export type FullDepthState = (typeof FULL_DEPTH_STATES)[number];

/** States where the responsible attorney holds a license (disclosure only). */
export const FIRM_LICENSE_STATES = ["TX", "IL"] as const;

/** @deprecated Use isFullDepthState — full Instant Attorney depth is TX-only for now. */
export const LICENSED_STATES = FULL_DEPTH_STATES;

export type LicensedState = FullDepthState;

/** US state / territory codes we accept in the picker (plus Out of US). */
export const US_STATE_OPTIONS: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "OTHER", name: "Outside the United States" },
];

/** Self-service tools that are Texas-law specific (soft-gated in Prep mode). */
export const TEXAS_SPECIFIC_TOOL_HREFS = [
  "/family/child-support",
  "/family/property-division",
  "/family/possession-schedule",
  "/family/maintenance",
  "/bankruptcy/means-test",
  "/bankruptcy/exemptions",
  "/personal-injury/sol",
  "/personal-injury/fault",
  "/debt/rights",
  "/employment/noncompete",
] as const;

const STATE_BAR_REFERRAL: Record<string, string> = {
  AL: "https://www.alabar.org/for-the-public/need-a-lawyer/",
  AZ: "https://www.azbar.org/for-the-public/find-a-lawyer/",
  CA: "https://www.calbar.ca.gov/Public/Need-Legal-Help",
  CO: "https://www.cobar.org/For-the-Public/Find-a-Lawyer",
  FL: "https://www.floridabar.org/public/lrs/",
  GA: "https://www.gabar.org/forthepublic/findalawyer/",
  IL: "https://www.isba.org/public/legalhelp",
  IN: "https://www.inbar.org/page/lawyerreferral",
  MA: "https://www.massbar.org/public/need-a-lawyer",
  MD: "https://www.msba.org/for-the-public/",
  MI: "https://www.michbar.org/programs/lawyerreferral",
  MN: "https://www.mnbar.org/public/find-a-lawyer",
  MO: "https://mobar.org/public/find-a-lawyer/",
  NC: "https://www.ncbar.org/public-resources/find-a-lawyer/",
  NJ: "https://tcms.njsba.com/PersonifyEbusiness/Default.aspx?TabID=1698",
  NY: "https://www.nysba.org/lawyerreferral/",
  OH: "https://www.ohiobar.org/public-resources/find-a-lawyer/",
  OR: "https://www.osbar.org/public/ris.html",
  PA: "https://www.pabar.org/site/For-the-Public/Find-a-Lawyer",
  TN: "https://www.tba.org/?pg=FindALawyer",
  VA: "https://www.vsb.org/Site/Public/Find-a-Lawyer.aspx",
  WA: "https://www.wsba.org/for-the-public/find-legal-help",
  WI: "https://www.wisbar.org/forPublic/INeedALawyer/Pages/I-Need-a-Lawyer.aspx",
};

const ABA_FIND_HELP = "https://www.americanbar.org/groups/legal_services/flh-home/";

export function stateName(code: string | null | undefined): string {
  if (!code) return "your state";
  return US_STATE_OPTIONS.find((s) => s.code === code.trim().toUpperCase())?.name ?? code;
}

export function normalizeStateCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (c === "OTHER" || US_STATE_OPTIONS.some((s) => s.code === c)) return c;
  // Accept full state names from Living File JURISDICTION lines
  const byName = US_STATE_OPTIONS.find((s) => s.name.toLowerCase() === code.trim().toLowerCase());
  return byName?.code ?? null;
}

/** True when Instant Attorney should run full Texas depth for this matter. */
export function isFullDepthState(code: string | null | undefined): boolean {
  const c = normalizeStateCode(code);
  if (!c) return false;
  return (FULL_DEPTH_STATES as readonly string[]).includes(c);
}

/** @deprecated Prefer isFullDepthState */
export function isLicensedState(code: string | null | undefined): boolean {
  return isFullDepthState(code);
}

/**
 * Prep mode: matter is outside Texas full-depth (including IL and every other
 * state). Unknown/null is NOT prep — treat as unconfirmed.
 */
export function isPrepMode(code: string | null | undefined): boolean {
  const c = normalizeStateCode(code);
  if (!c) return false;
  return !isFullDepthState(c);
}

export function stateBarReferralUrl(code: string | null | undefined): string {
  const c = normalizeStateCode(code);
  if (!c || c === "OTHER" || c === "TX") return ABA_FIND_HELP;
  return STATE_BAR_REFERRAL[c] ?? ABA_FIND_HELP;
}

/** Client-facing banner / onboarding notice for Prep-mode states. */
export function jurisdictionNotice(stateCode: string | null | undefined): string | null {
  if (!stateCode || isFullDepthState(stateCode)) return null;
  const name = stateName(stateCode);
  return (
    `Full Instant Attorney depth is built for Texas matters. For ${name}, you are in ` +
    `Local Counsel Prep mode: we help you organize facts, timelines, and questions, then ` +
    `hand you off to a ${name}-licensed attorney. We do not give ${name}-specific legal advice or act as your local counsel.`
  );
}

export function prepModeBadgeLabel(stateCode: string | null | undefined): string {
  return `Local Counsel Prep · ${stateName(stateCode)}`;
}

export function prepModeWatermarkDetail(stateCode: string | null | undefined): string {
  const name = stateName(stateCode);
  return (
    `LOCAL COUNSEL PREP — Draft for discussion with a ${name}-licensed attorney. ` +
    `Not ${name}-specific legal advice. Do not file, sign, or serve until local counsel reviews it.`
  );
}

/** System-prompt block injected for Prep-mode free chat and ACP. */
export function prepModePromptBlock(stateCode: string | null | undefined): string {
  const name = stateName(stateCode);
  const referral = stateBarReferralUrl(stateCode);
  return `=== LOCAL COUNSEL PREP MODE (${name}) ===
Crawford Law PLLC / Instant Attorney's FULL depth (Texas statutes, Texas calculators, Texas filing posture) is for TEXAS matters only right now. This user's matter is in ${name}.

YOUR LANE IN THIS MODE:
- Help them understand the situation in PLAIN ENGLISH using general / federal principles where they apply (e.g. FDCPA, FCRA, Title VII, FLSA, bankruptcy basics).
- Organize facts, timeline, goals, open questions, and a clean brief they can hand to a ${name}-licensed attorney.
- ALWAYS set RECOMMEND_CONSULT / recommend local counsel. Prefer "prepare for local counsel" as the next action.
- Point them to local help: ${referral}

HARD LIMITS — do NOT:
- Apply Texas Family Code, Texas homestead quirks, Texas child-support guidelines, Texas SPO, Texas non-compete doctrine, or other Texas-only rules as if they govern ${name}.
- Invent ${name} statutes, case cites, filing forms, or deadlines. If you are not certain of ${name} law, say so and defer to local counsel.
- Tell them a Texas-specific calculator result is authoritative for ${name}.
- Draft pleadings or notices framed as ready to file in ${name} courts. Generic demand/timeline drafts must be labeled for local-counsel review only.

JURISDICTION line in Living File updates: use "${name}" (never default to Texas when the matter is ${name}).
Tone: useful and honest — they ARE welcome here; they should expect a handoff, not Texas-depth answers.`;
}

/** Normalize a free-text Living File JURISDICTION value toward a state code. */
export function jurisdictionFromCaseFileText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/unconfirmed/i.test(trimmed)) return null;
  const code = normalizeStateCode(trimmed);
  if (code) return code;
  // "Texas", "State of Texas", etc.
  const m = trimmed.match(/\b([A-Z]{2})\b/);
  if (m && normalizeStateCode(m[1])) return m[1].toUpperCase();
  return null;
}

export function isTexasSpecificToolHref(href: string): boolean {
  const path = href.split("?")[0];
  return (TEXAS_SPECIFIC_TOOL_HREFS as readonly string[]).includes(path);
}
