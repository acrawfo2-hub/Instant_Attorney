import type { DocumentGenerationSpec, DraftSectionKind } from "./document-generation-spec.ts";

export interface StructuredDraftSection {
  id: string;
  text: string;
  factKeys: string[];
  kind?: DraftSectionKind;
}

export interface ActiveDraft {
  id: string;
  priority: number;
  sections: StructuredDraftSection[];
}

export interface RefinementJob {
  draftId: string;
  changedFactKeys: string[];
  affectedSectionIds: string[];
  runAfter: Date;
}

export function parseStructuredSections(response: string, spec: DocumentGenerationSpec): StructuredDraftSection[] {
  const match = response.match(/---STRUCTURED SECTIONS---\s*([\s\S]*?)\s*---END STRUCTURED SECTIONS---/);
  if (!match) return [];
  const parsed: unknown = JSON.parse(match[1]);
  if (!Array.isArray(parsed)) throw new Error("Structured section envelope must be an array");
  const allowed = new Map(spec.sections.map((section) => [section.id, section]));
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid structured section");
    const item = entry as Record<string, unknown>;
    const sectionSpec = allowed.get(String(item.id));
    if (!sectionSpec || typeof item.text !== "string" || !Array.isArray(item.factKeys)) {
      throw new Error(`Invalid structured section: ${String(item.id)}`);
    }
    return { id: sectionSpec.id, text: item.text, factKeys: [...new Set(item.factKeys.map(String))], kind: sectionSpec.kind };
  });
}

export function stripStructuredSections(response: string): string {
  return response.replace(/\s*---STRUCTURED SECTIONS---[\s\S]*?---END STRUCTURED SECTIONS---\s*/, "\n").trim();
}

export function affectedSections(sections: StructuredDraftSection[], changedFactKeys: Iterable<string>): StructuredDraftSection[] {
  const changed = new Set(changedFactKeys);
  return sections.filter((section) => section.factKeys.some((key) => changed.has(key)));
}

const MODEL_KINDS = new Set<DraftSectionKind>(["analysis", "remedy", "terms", "review"]);

export function requiresDraftingModel(sections: StructuredDraftSection[]): boolean {
  return sections.some((section) => !section.kind || MODEL_KINDS.has(section.kind));
}

/** Replace canonical {{fact.key}} placeholders without asking a model to copy values. */
export function substituteFactPlaceholders(text: string, facts: Readonly<Record<string, string>>): string {
  return text.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(facts, key) ? facts[key] : token,
  );
}

export class RefinementScheduler {
  private pending = new Map<string, RefinementJob>();
  private readonly debounceMs: number;
  private readonly now: () => Date;

  constructor(debounceMs = 2_000, now: () => Date = () => new Date()) {
    this.debounceMs = debounceMs;
    this.now = now;
  }

  schedule(changedFactKeys: Iterable<string>, drafts: ActiveDraft[]): RefinementJob[] {
    const changed = [...new Set(changedFactKeys)];
    for (const draft of drafts) {
      const affected = affectedSections(draft.sections, changed);
      if (!affected.length) continue;
      const prior = this.pending.get(draft.id);
      this.pending.set(draft.id, {
        draftId: draft.id,
        changedFactKeys: [...new Set([...(prior?.changedFactKeys ?? []), ...changed])],
        affectedSectionIds: [...new Set([...(prior?.affectedSectionIds ?? []), ...affected.map((s) => s.id)])],
        runAfter: new Date(this.now().getTime() + this.debounceMs),
      });
    }
    return [...this.pending.values()];
  }

  takeDue(at = this.now()): RefinementJob[] {
    const due = [...this.pending.values()].filter((job) => job.runAfter <= at);
    due.forEach((job) => this.pending.delete(job.draftId));
    return due;
  }
}

export interface UnresolvedFactRank {
  key: string;
  score: number;
  draftCount: number;
  requiredBy: string[];
}

/** Rank questions by breadth and draft priority; required keys carry twice the weight. */
export function rankUnresolvedFactKeys(
  drafts: Array<{ id: string; priority: number; spec: DocumentGenerationSpec }>,
  confirmedKeys: Iterable<string>,
): UnresolvedFactRank[] {
  const confirmed = new Set(confirmedKeys);
  const scores = new Map<string, UnresolvedFactRank>();
  for (const draft of drafts) {
    for (const [keys, multiplier] of [[draft.spec.requiredFactKeys, 2], [draft.spec.optionalFactKeys, 1]] as const) {
      for (const key of keys) {
        if (confirmed.has(key)) continue;
        const rank = scores.get(key) ?? { key, score: 0, draftCount: 0, requiredBy: [] };
        rank.score += Math.max(1, draft.priority) * multiplier;
        if (!rank.requiredBy.includes(draft.id)) {
          rank.requiredBy.push(draft.id);
          rank.draftCount += 1;
        }
        scores.set(key, rank);
      }
    }
  }
  return [...scores.values()].sort((a, b) => b.score - a.score || b.draftCount - a.draftCount || a.key.localeCompare(b.key));
}

export function consistencyCheckerPrompt(livingFile: string, sourceFacts: string, renderedDraft: string): string {
  return `You are an independent whole-document consistency critic. You did not draft this document. Compare the draft independently against both authoritative inputs. Do not rely on drafter reasoning.\n\n<LIVING_FILE>\n${livingFile}\n</LIVING_FILE>\n\n<SOURCE_FACTS>\n${sourceFacts}\n</SOURCE_FACTS>\n\n<DRAFT>\n${renderedDraft}\n</DRAFT>\n\nReturn JSON with status (pass|fail), contradictions, unsupported_assertions, cross_section_inconsistencies, and required_corrections. A draft may be marked ready only when status is pass.`;
}

export interface RefinementWorkerInput {
  sections: StructuredDraftSection[];
  changedFactKeys: string[];
  factValues: Readonly<Record<string, string>>;
  livingFile: string;
  sourceFacts: string;
}

export interface ConsistencyVerdict {
  status: "pass" | "fail";
  required_corrections?: string[];
}

/**
 * Refreshes only invalidated sections, choosing deterministic substitution for
 * non-legal sections, then gates readiness on an independent whole-document critic.
 */
export async function refineAndCheckDocument(
  input: RefinementWorkerInput,
  callbacks: {
    redraftSections: (sections: StructuredDraftSection[], changedFactKeys: string[]) => Promise<StructuredDraftSection[]>;
    checkConsistency: (args: { prompt: string; livingFile: string; sourceFacts: string; draft: string }) => Promise<ConsistencyVerdict>;
  },
): Promise<{ sections: StructuredDraftSection[]; renderedText: string; status: "ready" | "needs_revision"; verdict: ConsistencyVerdict }> {
  const invalid = affectedSections(input.sections, input.changedFactKeys);
  const replacements = requiresDraftingModel(invalid)
    ? await callbacks.redraftSections(invalid, input.changedFactKeys)
    : invalid.map((section) => ({ ...section, text: substituteFactPlaceholders(section.text, input.factValues) }));
  const byId = new Map(replacements.map((section) => [section.id, section]));
  const sections = input.sections.map((section) => byId.get(section.id) ?? section);
  const renderedText = sections.map((section) => section.text).join("\n\n");
  // Pass ground truth separately as fields as well as delimit it in the prompt;
  // the critic is never given the drafter's chain-of-thought or rationale.
  const verdict = await callbacks.checkConsistency({
    prompt: consistencyCheckerPrompt(input.livingFile, input.sourceFacts, renderedText),
    livingFile: input.livingFile,
    sourceFacts: input.sourceFacts,
    draft: renderedText,
  });
  return { sections, renderedText, status: verdict.status === "pass" ? "ready" : "needs_revision", verdict };
}
