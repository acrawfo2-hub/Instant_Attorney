import type { InstrumentType } from "./types.ts";

export type DocumentRisk = "low" | "high";
export type ForumRequirement = "jurisdiction" | "court" | "agency";

export interface InstrumentRiskProfile {
  risk: DocumentRisk;
  category: string;
  permitsJurisdictionNeutralDraft: boolean;
  requiredForum: ForumRequirement;
}

export interface JurisdictionBlock {
  code: "MISSING_GOVERNING_FORUM";
  risk: "high";
  category: string;
  missing: ForumRequirement;
  message: string;
}

const PLEADING = /\b(complaint|petition|answer|motion|pleading|lawsuit|summons)\b/i;
const ESTATE = /\b(will|trust|estate[- ]planning|power of attorney|advance directive)\b/i;
const DEED = /\b(deed|conveyance|real property transfer)\b/i;
const NOTICE = /\b(statutory notice|notice to vacate|lien notice|notice of claim)\b/i;
const PUBLIC_RECORDS = /\b(foia|freedom of information|open records|public records)\b/i;
const ADMIN = /\b(administrative filing|agency filing|administrative appeal|government filing)\b/i;
const CORRESPONDENCE = /\b(letter|correspondence|email|memo(?:randum)?)\b/i;

export function classifyInstrumentRisk(
  instrumentType: InstrumentType,
  instrument?: string | null,
): InstrumentRiskProfile {
  const name = instrument?.trim() || "";
  if (PUBLIC_RECORDS.test(name) || ADMIN.test(name)) {
    return { risk: "high", category: "administrative or public-records request", permitsJurisdictionNeutralDraft: false, requiredForum: "agency" };
  }
  if (PLEADING.test(name)) {
    return { risk: "high", category: "pleading", permitsJurisdictionNeutralDraft: false, requiredForum: "court" };
  }
  if (instrumentType === "wills_trusts" || ESTATE.test(name)) {
    return { risk: "high", category: "estate-planning instrument", permitsJurisdictionNeutralDraft: false, requiredForum: "jurisdiction" };
  }
  if (DEED.test(name)) {
    return { risk: "high", category: "deed", permitsJurisdictionNeutralDraft: false, requiredForum: "jurisdiction" };
  }
  if (NOTICE.test(name)) {
    return { risk: "high", category: "statutory notice", permitsJurisdictionNeutralDraft: false, requiredForum: "jurisdiction" };
  }
  if (instrumentType === "demand_letter" || instrumentType === "complaint_letter" || CORRESPONDENCE.test(name)) {
    return { risk: "low", category: "correspondence", permitsJurisdictionNeutralDraft: true, requiredForum: "jurisdiction" };
  }
  return { risk: "high", category: "substantive legal instrument", permitsJurisdictionNeutralDraft: false, requiredForum: "jurisdiction" };
}

export function buildJurisdictionBlock(profile: InstrumentRiskProfile): JurisdictionBlock {
  const noun = profile.requiredForum === "court" ? "court and governing jurisdiction" : profile.requiredForum === "agency" ? "agency and governing jurisdiction" : "governing jurisdiction";
  return {
    code: "MISSING_GOVERNING_FORUM",
    risk: "high",
    category: profile.category,
    missing: profile.requiredForum,
    message: `Before drafting this ${profile.category}, provide the ${noun}.`,
  };
}

/**
 * Is this a forum somebody actually confirmed?
 *
 * The match is a prefix, not an exact string, and that is the whole point. This
 * used to be anchored — `/^(unconfirmed|unknown|...)$/` — while two prompt
 * templates instructed the model to write the Living File line as
 * `JURISDICTION: Unconfirmed — defaulting to Texas`. That value is parsed
 * straight into `case_files.jurisdiction`, and because of the trailing clause it
 * did not match the anchored pattern, so this returned **true**: the forum gate
 * saw a confirmed forum, skipped FORUM_PLACEHOLDER, and drafted a high-risk
 * instrument under Texas law that nobody had confirmed. Prompt text defeating a
 * code gate, invisible to every test.
 *
 * The prompts are fixed. This is the belt: a value that announces its own
 * uncertainty is not a forum, however it continues.
 */
export function hasConfirmedForum(jurisdiction: string | null | undefined): boolean {
  const value = jurisdiction?.trim();
  if (!value) return false;
  return !/^(unconfirmed|unknown|undetermined|n\/a|not sure|tbd|pending)\b/i.test(value);
}

export function hasRequiredForum(
  profile: InstrumentRiskProfile,
  jurisdiction: string | null | undefined,
  confirmedFacts: string[] = [],
): boolean {
  if (!hasConfirmedForum(jurisdiction)) return false;
  if (profile.requiredForum === "jurisdiction") return true;
  const forumText = [jurisdiction, ...confirmedFacts].filter(Boolean).join(" ");
  const identifiesNamedForum = /[,;—–-]/.test(forumText);
  return profile.requiredForum === "court"
    ? identifiesNamedForum || /\b(court|district|county court|justice of the peace|tribunal)\b/i.test(forumText)
    : identifiesNamedForum || /\b(agency|department|commission|board|bureau|office|ministry|records custodian)\b/i.test(forumText);
}
