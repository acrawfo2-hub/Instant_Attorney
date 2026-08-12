import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAuthoritiesGate } from "@/lib/attorney-review-authorities";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { maxOutputTokensFor } from "@/lib/token-limits";
import {
  DOCUMENT_QA_CHECK_TYPES,
  type Attachment,
  type CaseFile,
  type Document,
  type DocumentQaCheckType,
  type DocumentQaFinding,
  type DocumentQaSeverity,
  type FactItem,
} from "@/lib/types";

const MODEL = "claude-sonnet-4-6";
const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const CHECK_SET = new Set<string>(DOCUMENT_QA_CHECK_TYPES);

export interface FormattingStandard {
  jurisdiction: string;
  documentTypes: string[];
  requirements: string[];
  source: string;
}

/** Curated, auditable rules take priority. An absent match explicitly invokes research fallback. */
export const FORMATTING_REGISTRY: readonly FormattingStandard[] = [
  {
    jurisdiction: "federal",
    documentTypes: ["complaint", "motion", "brief", "pleading"],
    requirements: [
      "Use a caption naming the court, parties, file number when assigned, and document title.",
      "Number paragraphs for allegations and claims; include a signature block with attorney contact and bar information.",
      "Confirm the governing court's page, font, spacing, margin, filing, and certificate requirements before filing.",
    ],
    source: "Federal Rules of Civil Procedure 7, 10, and 11; local rules still control presentation details.",
  },
];

export function normalizeCheckTypes(input: unknown): DocumentQaCheckType[] {
  if (!Array.isArray(input)) return [...DOCUMENT_QA_CHECK_TYPES];
  return [...new Set(input.filter((v): v is DocumentQaCheckType => typeof v === "string" && CHECK_SET.has(v)))];
}

export function formattingGuidance(docType: string, jurisdiction: string | null): { guidance: string; fallbackRequired: boolean } {
  const needle = (jurisdiction ?? "").toLowerCase();
  const match = FORMATTING_REGISTRY.find((entry) =>
    (needle.includes(entry.jurisdiction) || entry.jurisdiction.includes(needle)) &&
    entry.documentTypes.some((type) => docType.toLowerCase().includes(type)),
  );
  if (match) {
    return { guidance: `${match.requirements.join("\n")}\nRegistry source: ${match.source}`, fallbackRequired: false };
  }
  return {
    guidance: "No curated standard matches. Identify the likely court and flag the exact rules an attorney must validate against an official court source; do not claim automated compliance.",
    fallbackRequired: true,
  };
}

function parseFindings(text: string, selected: DocumentQaCheckType[]): Array<Pick<DocumentQaFinding, "check_type" | "severity" | "document_location" | "title" | "evidence">> {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const rows = JSON.parse(match[0]) as unknown[];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      if (typeof item.check_type !== "string" || !selected.includes(item.check_type as DocumentQaCheckType)) return [];
      const allowed = new Set<DocumentQaSeverity>(["blocking", "high", "medium", "low"]);
      const severity = allowed.has(item.severity as DocumentQaSeverity) ? item.severity as DocumentQaSeverity : "medium";
      if (typeof item.title !== "string" || typeof item.evidence !== "string") return [];
      return [{
        check_type: item.check_type as DocumentQaCheckType,
        severity,
        document_location: typeof item.document_location === "string" ? item.document_location : "Document-wide",
        title: item.title,
        evidence: item.evidence,
      }];
    });
  } catch { return []; }
}

export interface QaContext {
  runId: string;
  parentDoc: Document;
  workingDoc: Document;
  caseFile: CaseFile;
  facts: FactItem[];
  attachments: Attachment[];
  checkTypes: DocumentQaCheckType[];
}

/** Run selected adversarial checks against the active revision, replacing only those check types. */
export async function runDocumentQaChecks(db: SupabaseClient, context: QaContext): Promise<DocumentQaFinding[]> {
  const { runId, parentDoc, workingDoc, caseFile, facts, attachments } = context;
  const checkTypes = normalizeCheckTypes(context.checkTypes);
  const revision = workingDoc.updated_at;
  const genericTypes = checkTypes.filter((type) => type !== "authorities");
  let findings: ReturnType<typeof parseFindings> = [];

  if (genericTypes.length) {
    const format = formattingGuidance(parentDoc.doc_type, caseFile.jurisdiction);
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxOutputTokensFor(MODEL),
      ...(format.fallbackRequired && genericTypes.includes("formatting_court_requirements") ? {
        tools: [
          { type: "web_search_20260209" as const, name: "web_search" },
          { type: "web_fetch_20260209" as const, name: "web_fetch" },
        ],
      } : {}),
      system: "You are an adversarial document QA reviewer. Return JSON only. A blocking result means approval would create a material legal, factual, execution, or filing failure—not a preference. Never invent facts or rules.",
      messages: [{ role: "user", content: `Run only these independently-scoped checks: ${genericTypes.join(", ")}.
Return an array of {check_type,severity,document_location,title,evidence}. Return [] when no finding exists.
MATTER: ${JSON.stringify({ matter_type: caseFile.matter_type, summary: caseFile.summary, goals: caseFile.goals, jurisdiction: caseFile.jurisdiction })}
CONFIRMED/AVAILABLE FACTS: ${JSON.stringify(facts.map((f) => ({ description: f.description, status: f.status, kind: f.kind ?? "fact" })))}
ATTACHMENTS: ${JSON.stringify(attachments.map((a) => a.file_name))}
FORMATTING GUIDANCE: ${format.guidance}
FALLBACK REQUIRED: ${format.fallbackRequired}. When true, search official court sources. Cite the official source in evidence; if the controlling court or rule cannot be established, report that limitation and say automated validation has not occurred.
ACTIVE WORKING REVISION (${revision}):
${workingDoc.draft_text ?? ""}` }],
    });
    await recordAiFromMessage(db, response, {
      userId: parentDoc.user_id, caseFileId: parentDoc.case_file_id, feature: "attorney_review_qa",
      metadata: { document_id: parentDoc.id, run_id: runId, check_types: genericTypes, revision, server_tools: format.fallbackRequired },
    });
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    findings = parseFindings(text, genericTypes);
  }

  if (checkTypes.includes("authorities")) {
    await runAuthoritiesGate(db, runId, parentDoc, workingDoc.draft_text ?? "");
    const { data: citations } = await db.from("document_qa_citations").select("*").eq("run_id", runId);
    findings.push(...(citations ?? []).filter((c) => c.verdict !== "verified").map((c) => ({
      check_type: "authorities" as const,
      severity: "blocking" as const,
      document_location: c.raw,
      title: `Authority is ${c.verdict}`,
      evidence: c.evidence || `The citation “${c.raw}” was not verified.`,
    })));
  }

  if (checkTypes.length) {
    await db.from("document_qa_findings").delete().eq("document_id", parentDoc.id).in("check_type", checkTypes);
  }
  if (findings.length) {
    await db.from("document_qa_findings").insert(findings.map((finding) => ({
      ...finding, run_id: runId, document_id: parentDoc.id, status: "open", last_run_revision: revision, automated: true,
    })));
  }
  if (checkTypes.length) {
    await db.from("document_qa_check_runs").upsert(checkTypes.map((check_type) => ({
      document_id: parentDoc.id, run_id: runId, check_type,
      last_run_revision: revision, completed_at: new Date().toISOString(),
    })), { onConflict: "document_id,check_type" });
  }
  const { data } = await db.from("document_qa_findings").select("*").eq("document_id", parentDoc.id).order("created_at");
  return (data ?? []) as DocumentQaFinding[];
}
