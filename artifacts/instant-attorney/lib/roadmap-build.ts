import { looksLikeFamilyMatter } from "./family-instruments";
import { looksLikeDebtMatter } from "./debt-instruments";
import { looksLikeDefamationMatter } from "./defamation-instruments";
import { looksLikeEmploymentMatter } from "./employment-instruments";
import { looksLikePersonalInjuryMatter } from "./pi-instruments";
import { buildFamilyRoadmap } from "./family-roadmap";
import { buildBankruptcyRoadmap } from "./bankruptcy-roadmap";
import { buildEmploymentRoadmap } from "./employment-roadmap";
import { buildPiRoadmap } from "./pi-roadmap";
import { buildMatterRoadmap } from "./matter-roadmap";
import { buildGenericRoadmap } from "./generic-roadmap";
import { applyAssertionOverrides, parseRoadmapAssertions } from "./roadmap-assertions";
import type { ResolvedRoadmap, RoadmapStage } from "./roadmap-types";
import { ROADMAP_BLUEPRINT_VERSION } from "./roadmap-types";
import type { CaseFile, ConsultRequest, Document, FactItem, RequestedAttachment } from "./types";

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
    openGapCount: gaps.length,
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
  return {
    isFamilyMatter: looksLikeFamilyMatter(matterText),
    isDebtMatter: looksLikeDebtMatter(matterText),
    isDefamationMatter: looksLikeDefamationMatter(matterText),
    isEmploymentMatter: looksLikeEmploymentMatter(matterText),
    isPiMatter: looksLikePersonalInjuryMatter(matterText),
  };
}
