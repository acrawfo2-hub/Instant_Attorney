import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_DOCUMENT_JOBS = 3;
const TYPE_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export interface PlannedDocument {
  identity: string;
  documentType: string;
  title: string;
  priority?: number;
}

export interface DocumentPlan {
  revision: number;
  inputFactRevision: number;
  documents: PlannedDocument[];
}

export function parseDocumentPlan(text: string): DocumentPlan | null {
  const match = text.match(/---DOCUMENT PLAN---\s*([\s\S]*?)\s*---END DOCUMENT PLAN---/);
  if (!match) return null;
  let value: unknown;
  try { value = JSON.parse(match[1]); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
      !Number.isSafeInteger(raw.inputFactRevision) || (raw.inputFactRevision as number) < 0 ||
      !Array.isArray(raw.documents) || raw.documents.length > MAX_DOCUMENT_JOBS) return null;
  const documents: PlannedDocument[] = [];
  for (const item of raw.documents) {
    if (!item || typeof item !== "object") return null;
    const d = item as Record<string, unknown>;
    if (typeof d.identity !== "string" || !TYPE_RE.test(d.identity) ||
        typeof d.documentType !== "string" || !TYPE_RE.test(d.documentType) ||
        typeof d.title !== "string" || !d.title.trim() || d.title.length > 160) return null;
    const priority = d.priority === undefined ? 0 : Number(d.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) return null;
    documents.push({ identity: d.identity, documentType: d.documentType, title: d.title.trim(), priority });
  }
  return { revision: raw.revision as number, inputFactRevision: raw.inputFactRevision as number, documents };
}

export function documentJobIdempotencyKey(caseFileId: string, identity: string, revision: number): string {
  return createHash("sha256").update(`${caseFileId}\0${identity}\0${revision}`).digest("hex");
}

/**
 * Commits a bounded plan and creates the visible workspace-draft shell for each
 * job immediately — before a worker claims it. The unique idempotency key makes
 * the job insert safe to retry; a second dispatch of the same plan reuses the
 * existing job and shell rather than minting another artifact.
 */
export async function dispatchDocumentPlan(db: SupabaseClient, args: {
  caseFileId: string; userId: string; plan: DocumentPlan;
}): Promise<string[]> {
  if (args.plan.documents.length > MAX_DOCUMENT_JOBS) throw new Error("A document plan may contain at most three jobs");
  const rows = args.plan.documents.map((doc) => ({
    case_file_id: args.caseFileId,
    user_id: args.userId,
    document_type: doc.documentType,
    title: doc.title,
    priority: doc.priority ?? 0,
    input_fact_revision: args.plan.inputFactRevision,
    plan_revision: args.plan.revision,
    idempotency_key: documentJobIdempotencyKey(args.caseFileId, doc.identity, args.plan.revision),
  }));
  if (!rows.length) return [];

  const { error: upsertError } = await db.from("document_generation_jobs")
    .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (upsertError) throw upsertError;

  const keys = rows.map((row) => row.idempotency_key);
  const { data: jobs, error: selectError } = await db.from("document_generation_jobs")
    .select("id, title, workspace_draft_id")
    .in("idempotency_key", keys);
  if (selectError) throw selectError;

  const now = new Date().toISOString();
  for (const job of jobs ?? []) {
    if (job.workspace_draft_id) continue;
    const { data: shell, error: shellError } = await db.from("client_workspace_drafts").insert({
      case_file_id: args.caseFileId,
      user_id: args.userId,
      title: job.title,
      content: "",
      source: "assistant",
    }).select("id").single();
    if (shellError) throw shellError;
    const { error: attachError } = await db.from("document_generation_jobs")
      .update({ workspace_draft_id: shell.id, updated_at: now })
      .eq("id", job.id);
    if (attachError) throw attachError;
  }

  return (jobs ?? []).map((row) => row.id as string);
}
