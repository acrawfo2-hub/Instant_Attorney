import type { CaseFile, FactItem } from "./types.ts";
import { detectMatterArea } from "./matter-roadmap.ts";
import { looksLikeFamilyMatter } from "./family-instruments.ts";
import { looksLikeDebtMatter } from "./debt-instruments.ts";
import { looksLikeDefamationMatter } from "./defamation-instruments.ts";
import { looksLikeEmploymentMatter } from "./employment-instruments.ts";
import { looksLikePersonalInjuryMatter } from "./pi-instruments.ts";
import { looksLikeEstateMatter } from "./estate-instruments.ts";
import { looksLikeTaxMatter } from "./tax-instruments.ts";

/** Practice-area deep-dive blocks that can be loaded on demand for ACP chat. */
export type AcpPracticeArea =
  | "hoa"
  | "family"
  | "debt"
  | "tax"
  | "employment"
  | "defamation"
  | "personal_injury"
  | "estate";

const HOA_RE =
  /hoa|homeowner.*association|property.*owner.*association|condo.*association|cc&r|covenant|deed restriction/i;

export interface AcpMatterSignals {
  matterSubtype: string | null;
  matterText: string;
  /** Recent user/assistant text from the current turn or short history. */
  conversationText: string;
}

/** Build the combined text we scan for practice-area relevance. */
export function buildAcpMatterSignals(
  caseFile: CaseFile | null,
  facts: FactItem[],
  conversationText = "",
): AcpMatterSignals {
  const matterSubtype = caseFile?.matter_subtype ?? null;
  const matterText = [
    matterSubtype ?? "",
    caseFile?.summary ?? "",
    ...facts.slice(0, 40).map((f) => f.description),
  ].join(" ");
  return { matterSubtype, matterText, conversationText };
}

/**
 * Decide which practice-area deep dives to inject. Conservative: only include areas
 * with a positive signal — never load the full corpus on every turn.
 */
export function resolveAcpPracticeAreas(signals: AcpMatterSignals): AcpPracticeArea[] {
  const scan = [signals.matterText, signals.conversationText].join(" ");
  const areas = new Set<AcpPracticeArea>();

  const matterArea = detectMatterArea(signals.matterSubtype, signals.matterText);
  if (matterArea === "hoa" || HOA_RE.test(scan)) areas.add("hoa");
  if (matterArea === "employment" || looksLikeEmploymentMatter(scan)) areas.add("employment");
  if (matterArea === "estate" || looksLikeEstateMatter(scan)) areas.add("estate");
  if (matterArea === "debt" || looksLikeDebtMatter(scan)) areas.add("debt");
  if (looksLikeFamilyMatter(scan)) areas.add("family");
  if (looksLikeTaxMatter(scan)) areas.add("tax");
  if (looksLikeDefamationMatter(scan)) areas.add("defamation");

  const isEmployment = looksLikeEmploymentMatter(scan);
  if (looksLikePersonalInjuryMatter(scan) && !isEmployment) areas.add("personal_injury");

  return [...areas];
}
