import { resolveRoadmapForCase } from "./roadmap-build.ts";
import type {
  CaseFile,
  ConsultRequest,
  Document,
  FactItem,
  RequestedAttachment,
} from "./types.ts";

export type EngagementLevel = "high" | "moderate" | "low";

export interface ClientEngagement {
  level: EngagementLevel;
  signals: string[];
}

export interface DocumentChecklist {
  onFile: number;
  requested: number;
  uploaded: number;
  waived: number;
  missing: { description: string; reason: string | null }[];
}

export interface TimelineSnapshot {
  currentStage: string | null;
  pathLabel: string | null;
  nextAction: string | null;
  urgentNote: string | null;
}

export interface ValueHint {
  label: string;
  range: string | null;
  basis: string;
}

export interface ConsultBriefSnapshot {
  matter: {
    title: string;
    type: string | null;
    subtype: string | null;
    jurisdiction: string | null;
  };
  summary: string | null;
  goals: string[];
  timeline: TimelineSnapshot;
  documents: DocumentChecklist;
  engagement: ClientEngagement;
  strategy: {
    summary: string | null;
    strengths: string[];
    risks: string[];
    recommendConsult: boolean;
  };
  openGaps: string[];
  confirmedFactCount: number;
  valueHints: ValueHint[];
  preConsultMemo: string | null;
}

export interface ConsultBriefInput {
  caseFile: CaseFile;
  facts: FactItem[];
  documents: Document[];
  requestedAttachments: RequestedAttachment[];
  consultRequest?: ConsultRequest | null;
}

const VALUE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /net\s+recover(?:y|ies)[:\s]*\$?([\d,]+(?:\.\d{2})?)\s*(?:–|-|to)\s*\$?([\d,]+(?:\.\d{2})?)/i, label: "Net recovery" },
  { pattern: /damages?\s*(?:range)?[:\s]*\$?([\d,]+(?:\.\d{2})?)\s*(?:–|-|to)\s*\$?([\d,]+(?:\.\d{2})?)/i, label: "Damages range" },
  { pattern: /child\s+support[:\s]*\$?([\d,]+(?:\.\d{2})?)\s*(?:–|-|to|\/mo)?\s*\$?([\d,]+(?:\.\d{2})?)?/i, label: "Child support" },
  { pattern: /probate\s+cost[:\s]*\$?([\d,]+(?:\.\d{2})?)\s*(?:–|-|to)\s*\$?([\d,]+(?:\.\d{2})?)/i, label: "Probate cost" },
  { pattern: /settlement\s+(?:range)?[:\s]*\$?([\d,]+(?:\.\d{2})?)\s*(?:–|-|to)\s*\$?([\d,]+(?:\.\d{2})?)/i, label: "Settlement range" },
];

function fmtMoney(n: string): string {
  const num = Number(n.replace(/,/g, ""));
  if (!Number.isFinite(num)) return n;
  return num.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function extractValueHints(facts: FactItem[], caseFile: CaseFile): ValueHint[] {
  const hints: ValueHint[] = [];
  const seen = new Set<string>();
  const corpus = [
    caseFile.summary ?? "",
    ...facts.filter((f) => f.status === "confirmed").map((f) => f.description),
  ].join("\n");

  for (const { pattern, label } of VALUE_PATTERNS) {
    const m = corpus.match(pattern);
    if (!m) continue;
    const range = m[2] ? `${fmtMoney(m[1])} – ${fmtMoney(m[2])}` : fmtMoney(m[1]);
    const key = `${label}:${range}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({ label, range, basis: "From case facts / calculator output" });
  }

  return hints.slice(0, 3);
}

export function computeClientEngagement(
  facts: FactItem[],
  requestedAttachments: RequestedAttachment[],
  caseFile: CaseFile,
): ClientEngagement {
  const signals: string[] = [];
  const gaps = facts.filter((f) => f.status === "gap" && f.kind !== "hypothetical");
  const confirmed = facts.filter((f) => f.status === "confirmed" && f.kind !== "hypothetical");
  const totalFacts = gaps.length + confirmed.length;

  const actionable = requestedAttachments.filter((r) => r.status !== "waived");
  const uploaded = requestedAttachments.filter((r) => r.status === "uploaded").length;
  const pending = requestedAttachments.filter((r) => r.status === "requested").length;

  if (actionable.length > 0) {
    signals.push(`Uploaded ${uploaded}/${actionable.length} requested documents`);
  } else if (requestedAttachments.length === 0) {
    signals.push("No document requests on file yet");
  }

  if (totalFacts > 0) {
    signals.push(`Answered ${confirmed.length}/${totalFacts} fact items`);
  }

  const opened = new Date(caseFile.opened_at).getTime();
  const updated = new Date(caseFile.updated_at).getTime();
  const daysActive = Math.max(1, Math.round((updated - opened) / (1000 * 60 * 60 * 24)));
  signals.push(`File active ${daysActive} day${daysActive === 1 ? "" : "s"}`);

  if (caseFile.summary && caseFile.goals.length > 0) {
    signals.push("Summary and goals captured");
  }

  let score = 0;
  if (actionable.length > 0) score += uploaded / actionable.length;
  else score += 0.5;
  if (totalFacts > 0) score += confirmed.length / totalFacts;
  else score += 0.3;
  if (caseFile.summary) score += 0.2;
  if (caseFile.goals.length > 0) score += 0.2;
  if (pending > 2) score -= 0.2;

  const normalized = score / 2.1;
  let level: EngagementLevel = "moderate";
  if (normalized >= 0.65) level = "high";
  else if (normalized < 0.4) level = "low";

  return { level, signals };
}

/** Parse ---PRE-CONSULT MEMO--- blocks into section headings → body. */
export function parsePreConsultMemo(memo: string): { title: string; body: string }[] {
  const inner = memo.match(/---PRE-CONSULT MEMO---([\s\S]*?)---END MEMO---/i);
  const text = inner ? inner[1].trim() : memo.trim();
  if (!text) return [];

  const sections: { title: string; body: string }[] = [];
  const parts = text.split(/\n(?=[A-Z][A-Z &/]+:)/);
  for (const part of parts) {
    const m = part.match(/^([A-Z][A-Z &/]+):\s*([\s\S]*)$/);
    if (m) {
      sections.push({ title: m[1].trim(), body: m[2].trim() });
    } else if (part.trim()) {
      sections.push({ title: "Overview", body: part.trim() });
    }
  }
  return sections;
}

export function buildConsultBriefSnapshot(input: ConsultBriefInput): ConsultBriefSnapshot {
  const { caseFile, facts, documents, requestedAttachments, consultRequest } = input;
  const gaps = facts.filter((f) => f.status === "gap" && f.kind !== "hypothetical");
  const roadmap = resolveRoadmapForCase({
    caseFile,
    facts,
    documents,
    requestedAttachments,
    consultRequest: consultRequest ?? null,
  });

  const currentStage = roadmap?.stages.find((s) => s.key === roadmap.currentStageKey);
  const uploaded = requestedAttachments.filter((r) => r.status === "uploaded").length;
  const waived = requestedAttachments.filter((r) => r.status === "waived").length;
  const missing = requestedAttachments
    .filter((r) => r.status === "requested")
    .map((r) => ({ description: r.description, reason: r.reason }));

  const strategy = caseFile.legal_strategy;

  return {
    matter: {
      title: caseFile.title ?? "Untitled matter",
      type: caseFile.matter_type,
      subtype: caseFile.matter_subtype,
      jurisdiction: caseFile.jurisdiction,
    },
    summary: caseFile.summary,
    goals: caseFile.goals ?? [],
    timeline: {
      currentStage: currentStage?.label ?? null,
      pathLabel: roadmap?.pathLabel ?? null,
      nextAction: caseFile.next_action,
      urgentNote: roadmap?.urgentNote ?? roadmap?.safetyNote ?? null,
    },
    documents: {
      onFile: documents.filter((d) => d.draft_text || d.status !== "pre_warmed").length,
      requested: requestedAttachments.length,
      uploaded,
      waived,
      missing,
    },
    engagement: computeClientEngagement(facts, requestedAttachments, caseFile),
    strategy: {
      summary: strategy?.summary ?? null,
      strengths: strategy?.strengths ?? [],
      risks: strategy?.risks ?? [],
      recommendConsult: strategy?.recommend_consult ?? false,
    },
    openGaps: gaps.slice(0, 5).map((g) => g.description),
    confirmedFactCount: facts.filter((f) => f.status === "confirmed").length,
    valueHints: extractValueHints(facts, caseFile),
    preConsultMemo: caseFile.pre_consult_memo,
  };
}
