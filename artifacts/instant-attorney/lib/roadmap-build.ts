import { looksLikeFamilyMatter } from "./family-instruments.ts";
import { looksLikeDebtMatter } from "./debt-instruments.ts";
import { looksLikeDefamationMatter } from "./defamation-instruments.ts";
import { looksLikeEmploymentMatter } from "./employment-instruments.ts";
import { looksLikePersonalInjuryMatter } from "./pi-instruments.ts";
import { buildFamilyRoadmap } from "./family-roadmap.ts";
import { buildBankruptcyRoadmap } from "./bankruptcy-roadmap.ts";
import { buildEmploymentRoadmap } from "./employment-roadmap.ts";
import { buildPiRoadmap } from "./pi-roadmap.ts";
import { buildMatterRoadmap } from "./matter-roadmap.ts";
import { buildGenericRoadmap } from "./generic-roadmap.ts";
import { applyAssertionOverrides, parseRoadmapAssertions } from "./roadmap-assertions.ts";
import { placeholderFields } from "./wizard-parsing.ts";
import type { ResolvedRoadmap, RoadmapStage } from "./roadmap-types.ts";
import { ROADMAP_BLUEPRINT_VERSION } from "./roadmap-types.ts";
import type { CaseFile, ConsultRequest, Document, FactItem, RequestedAttachment } from "./types.ts";

export interface RoadmapBuildInput {
  caseFile: CaseFile;
  facts: FactItem[];
  documents: Document[];
  requestedAttachments: RequestedAttachment[];
  consultRequest: ConsultRequest | null;
}

function currentStageKey(stages: RoadmapStage[]): string | null {
  return stages.find((s) => s.status === "current")?.key ?? null;
}

function withClientAssertions(
  stages: RoadmapStage[],
  factDescriptions: string[],
): RoadmapStage[] {
  const assertions = parseRoadmapAssertions(factDescriptions);
  return applyAssertionOverrides(stages, assertions);
}

/** Gaps tied to document placeholders are shown under each draft, not as open file gaps. */
function countOpenGapsExcludingPlaceholders(
  gaps: FactItem[],
  documents: Document[],
): number {
  const placeholderLabelSet = new Set<string>();
  for (const doc of documents) {
    if (!doc.draft_text) continue;
    for (const field of placeholderFields(doc.draft_text)) {
      placeholderLabelSet.add(field.label.toLowerCase());
    }
  }
  return gaps.filter((g) => !placeholderLabelSet.has(g.description.toLowerCase())).length;
}

/** Resolve the Tier-1/Tier-2 roadmap for a case file (deterministic, no I/O). */
export function resolveRoadmapForCase(input: RoadmapBuildInput): ResolvedRoadmap | null {
  const { caseFile, facts, documents, requestedAttachments, consultRequest } = input;
  const confirmed = facts.filter((f) => f.status === "confirmed");
  const gaps = facts.filter((f) => f.status === "gap");
  const matterText = `${caseFile.matter_subtype ?? ""} ${caseFile.summary ?? ""}`;
  const factDescriptions = confirmed.map((f) => f.description);
  const docSummaries = documents.map((d) => ({ title: d.title, status: d.status }));

  if (looksLikeFamilyMatter(matterText)) {
    const r = buildFamilyRoadmap({
      matterSubtype: caseFile.matter_subtype,
      matterText,
      facts: factDescriptions,
      documents: docSummaries,
    });
    const stages = withClientAssertions(r.stages, factDescriptions);
    return {
      blueprintKey: `family-${r.path}`,
      blueprintVersion: ROADMAP_BLUEPRINT_VERSION,
      label: "Your Roadmap",
      pathLabel: r.pathLabel,
      safety: r.safety,
      safetyNote: r.safetyNote,
      stages,
      disclaimer: r.disclaimer,
      currentStageKey: currentStageKey(stages),
    };
  }

  if (looksLikeDebtMatter(matterText)) {
    const r = buildBankruptcyRoadmap({
      matterText,
      facts: factDescriptions,
      documents: docSummaries,
    });
    const stages = withClientAssertions(r.stages, factDescriptions);
    return {
      blueprintKey: "bankruptcy",
      blueprintVersion: ROADMAP_BLUEPRINT_VERSION,
      label: "Your Roadmap — Debt Relief",
      stages,
      disclaimer: r.disclaimer,
      currentStageKey: currentStageKey(stages),
    };
  }

  if (looksLikeEmploymentMatter(matterText)) {
    const r = buildEmploymentRoadmap({
      matterText,
      facts: factDescriptions,
      documents: docSummaries,
    });
    const stages = withClientAssertions(r.stages, factDescriptions);
    return {
      blueprintKey: "employment",
      blueprintVersion: ROADMAP_BLUEPRINT_VERSION,
      label: "Your Roadmap — Employment",
      stages,
      disclaimer: r.disclaimer,
      currentStageKey: currentStageKey(stages),
    };
  }

  if (looksLikePersonalInjuryMatter(matterText)) {
    const r = buildPiRoadmap({
      matterText,
      facts: factDescriptions,
      documents: docSummaries,
    });
    const stages = withClientAssertions(r.stages, factDescriptions);
    return {
      blueprintKey: "personal-injury",
      blueprintVersion: ROADMAP_BLUEPRINT_VERSION,
      label: "Your Roadmap",
      pathLabel: r.pathLabel,
      urgent: r.urgent,
      urgentNote: r.urgentNote,
      stages,
      disclaimer: r.disclaimer,
      currentStageKey: currentStageKey(stages),
    };
  }

  const matterCandidate = buildMatterRoadmap({
    matterSubtype: caseFile.matter_subtype,
    matterText,
    facts: factDescriptions,
    documents: docSummaries,
    hasStrategy: !!caseFile.legal_strategy,
  });

  if (matterCandidate.path !== "general") {
    const stages = withClientAssertions(matterCandidate.stages, factDescriptions);
    return {
      blueprintKey: `matter-${matterCandidate.path}`,
      blueprintVersion: ROADMAP_BLUEPRINT_VERSION,
      label: "Your Roadmap",
      pathLabel: matterCandidate.pathLabel,
      stages,
      disclaimer: matterCandidate.disclaimer,
      currentStageKey: currentStageKey(stages),
    };
  }

  const r = buildGenericRoadmap({
    hasSummary: Boolean(caseFile.summary),
    matterTypeKnown: Boolean(caseFile.matter_type),
    confirmedFactCount: confirmed.length,
    openGapCount: countOpenGapsExcludingPlaceholders(gaps, documents),
    pendingUploadCount: requestedAttachments.filter((x) => x.status === "requested").length,
    hasDocumentPlan:
      (caseFile.legal_strategy?.document_plan?.length ?? 0) > 0 ||
      (caseFile.legal_strategy?.recommended_wizards?.length ?? 0) > 0,
    documents: documents.map((d) => ({ status: d.status, hasDraft: Boolean(d.draft_text) })),
    consultActive: Boolean(consultRequest) && consultRequest?.status !== "cancelled",
  });

  const stages = withClientAssertions(r.stages, factDescriptions);
  return {
    blueprintKey: "generic",
    blueprintVersion: ROADMAP_BLUEPRINT_VERSION,
    label: r.label,
    stages,
    disclaimer: r.disclaimer,
    currentStageKey: currentStageKey(stages),
  };
}

/** Which roadmap stage keys gate matter-specific tool cards (progressive disclosure). */
export function toolStageForSection(section: string, blueprintKey: string): string | null {
  if (blueprintKey.startsWith("family-")) {
    const map: Record<string, string> = {
      "family-child-support": "children",
      "family-property": "property",
      "family-possession": "children",
      "family-maintenance": "children",
    };
    return map[section] ?? null;
  }
  if (blueprintKey === "bankruptcy") {
    const map: Record<string, string> = {
      "debt-rights": "picture",
      "bankruptcy-tools": "choose",
    };
    return map[section] ?? null;
  }
  if (blueprintKey === "employment") {
    return section === "employment-tools" ? "assess" : null;
  }
  if (blueprintKey === "personal-injury") {
    const map: Record<string, string> = {
      "pi-rights": "preserve",
      "pi-sol": "timeline",
      "pi-fault": "proof",
    };
    return map[section] ?? null;
  }
  if (blueprintKey === "generic") {
    const map: Record<string, string> = {
      "employment-tools": "documents",
      "debt-rights": "build_file",
      "bankruptcy-tools": "build_file",
      "defamation": "understand",
      "what-if": "understand",
    };
    return map[section] ?? null;
  }
  return null;
}

export function detectMatterFlags(matterText: string) {
  const isEmploymentMatter = looksLikeEmploymentMatter(matterText);
  return {
    isFamilyMatter: looksLikeFamilyMatter(matterText),
    isDebtMatter: looksLikeDebtMatter(matterText),
    isDefamationMatter: looksLikeDefamationMatter(matterText),
    isEmploymentMatter,
    // Workplace injuries can match both detectors ("injured" + "at work"); prefer employment.
    isPiMatter: looksLikePersonalInjuryMatter(matterText) && !isEmploymentMatter,
  };
}
