import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConsultDisposition,
  ConsultRequest,
  ConsultWrapUp,
} from "./types.ts";

export const CONSULT_DISPOSITION_LABELS: Record<ConsultDisposition, string> = {
  retain_in_house: "Retain in-house",
  refer_out: "Refer to outside counsel",
  limited_scope: "Limited scope engagement",
  not_a_fit: "Not a fit / close file",
  follow_up_needed: "Follow-up consult needed",
};

export function newActionId(): string {
  return `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyWrapUp(): ConsultWrapUp {
  return {
    consultSummary: "",
    strategyOverview: "",
    disposition: "",
    referralNotes: "",
    expectedTimeline: "",
    expectedDocuments: [],
    clientActions: [],
    attorneyActions: [],
  };
}

export function mergeWrapUpPatch(current: ConsultWrapUp, patch: unknown): ConsultWrapUp {
  if (!patch || typeof patch !== "object") return current;
  const incoming = patch as Record<string, unknown>;
  return normalizeWrapUp({
    ...current,
    ...(typeof incoming.consultSummary === "string" ? { consultSummary: incoming.consultSummary } : {}),
    ...(typeof incoming.strategyOverview === "string" ? { strategyOverview: incoming.strategyOverview } : {}),
    ...(incoming.disposition !== undefined ? { disposition: incoming.disposition } : {}),
    ...(typeof incoming.referralNotes === "string" ? { referralNotes: incoming.referralNotes } : {}),
    ...(typeof incoming.expectedTimeline === "string" ? { expectedTimeline: incoming.expectedTimeline } : {}),
    ...(incoming.expectedDocuments !== undefined ? { expectedDocuments: incoming.expectedDocuments } : {}),
    ...(incoming.clientActions !== undefined ? { clientActions: incoming.clientActions } : {}),
    ...(incoming.attorneyActions !== undefined ? { attorneyActions: incoming.attorneyActions } : {}),
  });
}

export function normalizeWrapUp(raw: unknown): ConsultWrapUp {
  if (!raw || typeof raw !== "object") return emptyWrapUp();
  const o = raw as Record<string, unknown>;
  const actions = (arr: unknown) =>
    Array.isArray(arr)
      ? arr
          .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
          .map((x) => ({
            id: String(x.id ?? newActionId()),
            text: String(x.text ?? "").trim(),
            kind: x.kind === "document" ? ("document" as const) : ("general" as const),
          }))
          .filter((x) => x.text.length > 0)
      : [];

  const disposition = String(o.disposition ?? "");
  const validDispositions = new Set(Object.keys(CONSULT_DISPOSITION_LABELS));

  return {
    consultSummary: String(o.consultSummary ?? "").trim(),
    strategyOverview: String(o.strategyOverview ?? "").trim(),
    disposition: validDispositions.has(disposition) ? (disposition as ConsultDisposition) : "",
    referralNotes: String(o.referralNotes ?? "").trim(),
    expectedTimeline: String(o.expectedTimeline ?? "").trim(),
    expectedDocuments: actions(o.expectedDocuments),
    clientActions: actions(o.clientActions),
    attorneyActions: actions(o.attorneyActions),
  };
}

export interface WrapUpValidation {
  ok: boolean;
  errors: string[];
}

export function validateWrapUpForSubmit(wrapUp: ConsultWrapUp): WrapUpValidation {
  const errors: string[] = [];
  if (!wrapUp.consultSummary.trim()) {
    errors.push("Consult summary is required.");
  }
  if (!wrapUp.disposition) {
    errors.push("Select a disposition.");
  }
  if (wrapUp.disposition === "refer_out" && !wrapUp.referralNotes.trim()) {
    errors.push("Referral notes are required when referring out.");
  }
  const clientCount = wrapUp.clientActions.filter((a) => a.text.trim()).length;
  const attorneyCount = wrapUp.attorneyActions.filter((a) => a.text.trim()).length;
  if (clientCount === 0 && attorneyCount === 0) {
    errors.push("Add at least one client or attorney action item.");
  }
  return { ok: errors.length === 0, errors };
}

/** Apply a submitted wrap-up to the Living File and mark the consult complete. */
export async function applyWrapUpToLivingFile(
  db: SupabaseClient,
  consult: ConsultRequest,
  wrapUp: ConsultWrapUp,
): Promise<ConsultRequest> {
  if (!consult.case_file_id) {
    throw new Error("Consult has no linked case file");
  }

  const caseFileId = consult.case_file_id;
  const now = new Date().toISOString();

  const clientActions = wrapUp.clientActions.filter((a) => a.text.trim());
  const attorneyActions = wrapUp.attorneyActions.filter((a) => a.text.trim());
  const expectedDocuments = wrapUp.expectedDocuments.filter((a) => a.text.trim());
  const firstClientAction = clientActions[0]?.text.trim() ?? null;

  const caseUpdates: Record<string, unknown> = {
    attorney_assessment: wrapUp.consultSummary.trim(),
    updated_at: now,
  };
  if (firstClientAction) {
    caseUpdates.next_action = firstClientAction;
  }
  if (wrapUp.disposition === "refer_out") {
    caseUpdates.status = "referred";
  } else if (wrapUp.disposition === "not_a_fit") {
    caseUpdates.status = "closed";
  }

  await db.from("case_files").update(caseUpdates).eq("id", caseFileId);

  for (const action of clientActions) {
    if (action.kind !== "document") continue;
    await db.from("requested_attachments").insert({
      case_file_id: caseFileId,
      user_id: consult.user_id,
      description: action.text.trim(),
      reason: "Requested during consult",
      status: "requested",
      source: "attorney",
    });
  }

  const submittedPlan: ConsultWrapUp = {
    ...wrapUp,
    clientActions,
    attorneyActions,
    expectedDocuments,
  };

  const { data: updated, error } = await db
    .from("consult_requests")
    .update({
      status: "completed",
      post_consult_plan: submittedPlan,
      wrap_up_draft: submittedPlan,
      wrap_up_submitted_at: now,
      updated_at: now,
    })
    .eq("id", consult.id)
    .select("*")
    .single();

  if (error || !updated) {
    throw new Error(error?.message ?? "Failed to complete consult");
  }

  return updated as ConsultRequest;
}

/** Client-facing summary text including referral context when applicable. */
export function clientFacingConsultSummary(wrapUp: ConsultWrapUp): string {
  const parts = [wrapUp.consultSummary.trim()];
  if (wrapUp.disposition === "refer_out" && wrapUp.referralNotes.trim()) {
    parts.push(`Referral: ${wrapUp.referralNotes.trim()}`);
  }
  return parts.filter(Boolean).join("\n\n");
}
