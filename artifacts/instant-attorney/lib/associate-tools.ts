import type Anthropic from "@anthropic-ai/sdk";
import { startDocumentReview, runSelectedDocumentQa } from "./attorney-review.ts";
import { normalizeCheckTypes } from "./attorney-review-qa.ts";
import { DOCUMENT_QA_CHECK_TYPES, type DocumentQaCheckType } from "./types.ts";

/**
 * Specialists the junior associate may invoke. Each maps onto an existing
 * review/QA service — not a second implementation. None of these write the
 * working copy, approve, waive, or send.
 */

export const ASSOCIATE_SHORTCUTS = [
  {
    id: "adversarial",
    label: "Adversarial review",
    instruction: "Run adversarial review on this revision, then fix the dangerous issues.",
  },
  {
    id: "qa",
    label: "Full QA",
    instruction: "Run full QA on this revision, then fix what you can.",
  },
  {
    id: "placeholders",
    label: "Placeholders & execution",
    instruction: "Run the placeholders and execution checks, then fill or flag what the file already supports.",
  },
  {
    id: "formatting",
    label: "Formatting & filing",
    instruction: "Run formatting and filing checks, then fix what you can without inventing a court.",
  },
  {
    id: "authorities",
    label: "Authorities",
    instruction: "Run the authorities check, then fix or flag unverifiable citations. Do not invent a cite.",
  },
  {
    id: "explain",
    label: "Explain / second opinion",
    instruction: "Critique this revision: what is weak, risky, or missing? Fix the dangerous issues in the same turn.",
  },
] as const;

export type AssociateShortcutId = (typeof ASSOCIATE_SHORTCUTS)[number]["id"];

export function shortcutById(id: string | undefined): (typeof ASSOCIATE_SHORTCUTS)[number] | undefined {
  return ASSOCIATE_SHORTCUTS.find((item) => item.id === id);
}

const QA_SUBSETS: Record<string, DocumentQaCheckType[]> = {
  qa: [...DOCUMENT_QA_CHECK_TYPES],
  placeholders: ["blanks_execution_blocks", "completeness"],
  formatting: ["formatting_court_requirements"],
  authorities: ["authorities"],
};

export interface AssociateToolContext {
  documentId: string;
  caseFileId: string;
}

export const ASSOCIATE_TOOLS: Anthropic.Tool[] = [
  {
    name: "run_adversarial_review",
    description:
      "Start the existing adversarial review orchestrator (issue-spotting and structured improvements). It runs in the background; findings land in the workbench panel. Does not write the working copy, approve, waive, or send.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "run_document_qa",
    description:
      "Run existing document QA checks against the working revision. Omit check_types to run all. Allowed types: factual_consistency, completeness, defined_terms_cross_references, blanks_execution_blocks, formatting_court_requirements, client_comprehension, authorities. Writes canonical findings, not document text. Does not approve, waive, or send.",
    input_schema: {
      type: "object",
      properties: {
        check_types: { type: "array", items: { type: "string" } },
      },
      required: [],
    },
  },
  {
    name: "get_workbench_qa",
    description:
      "Read the latest review-run status, open blocking findings, and unverified citations. Use after a specialist run or when asked where the file stands. Does not write document text, approve, waive, or send.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

export async function dispatchAssociateTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AssociateToolContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<string> {
  if (name === "run_adversarial_review") {
    const run = await startDocumentReview(ctx.documentId, ctx.caseFileId);
    if (!run) return JSON.stringify({ error: "Could not start adversarial review." });
    return JSON.stringify({
      ok: true,
      run_id: run.id,
      status: run.status,
      note: "Review is running in the background. Findings will appear in the workbench. Fix what you already know; poll get_workbench_qa for the rest.",
    });
  }

  if (name === "run_document_qa") {
    const checkTypes = normalizeCheckTypes(input.check_types) as DocumentQaCheckType[];
    try {
      await runSelectedDocumentQa(ctx.documentId, checkTypes.length ? checkTypes : [...DOCUMENT_QA_CHECK_TYPES]);
      return JSON.stringify({
        ok: true,
        check_types: checkTypes.length ? checkTypes : [...DOCUMENT_QA_CHECK_TYPES],
        note: "Findings are on the workbench. Fix the dangerous ones in this turn. Do not waive or approve.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ error: message });
    }
  }

  if (name === "get_workbench_qa") {
    const [{ data: run }, { data: findings }, { data: citations }] = await Promise.all([
      db.from("document_review_runs").select("id, status, stage, error").eq("document_id", ctx.documentId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("document_qa_findings").select("id, title, severity, status, check_type")
        .eq("document_id", ctx.documentId).eq("status", "open").order("severity"),
      db.from("document_qa_citations").select("id, raw, verdict, waived")
        .eq("document_id", ctx.documentId).order("created_at"),
    ]);
    return JSON.stringify({
      run: run ?? null,
      open_findings: findings ?? [],
      citations: citations ?? [],
    });
  }

  return JSON.stringify({ error: `Unknown tool ${name}` });
}

/** Run a shortcut's specialist before the model turn, when the attorney clicked a button. */
export async function runAssociateShortcut(
  id: AssociateShortcutId,
  ctx: AssociateToolContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<string | null> {
  if (id === "explain") return null;
  if (id === "adversarial") return dispatchAssociateTool("run_adversarial_review", {}, ctx, db);
  const checkTypes = QA_SUBSETS[id];
  if (!checkTypes) return null;
  return dispatchAssociateTool("run_document_qa", { check_types: checkTypes }, ctx, db);
}
