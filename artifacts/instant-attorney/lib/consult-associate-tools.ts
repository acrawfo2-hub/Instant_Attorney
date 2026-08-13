import type Anthropic from "@anthropic-ai/sdk";
import { buildConsultBriefSnapshot } from "./consult-brief.ts";
import { buildConsultFeeEstimate } from "./consult-fee-estimate.ts";
import { buildConsultCloseoutDraft } from "./consult-closeout-generate.ts";
import { generatePreConsultMemo } from "./pre-consult-generate.ts";
import type { ConsultShortcutId } from "./consult-shortcuts.ts";
import type { CaseFile, ConsultNote, ConsultRecording, ConsultRequest, Document, FactItem, RequestedAttachment } from "./types.ts";

/**
 * Specialists the junior associate may invoke on a consult. Each maps onto an
 * existing consult service — not a second implementation. None of these start
 * or end the session, submit wrap-up, or send to the client.
 *
 * draft_closeout and run_fee_estimate compute only. The workbench applies the
 * result through the existing wrap-up / fee-estimate persist routes.
 * generate_preconsult_memo is the existing Living File writer.
 */

export {
  CONSULT_SHORTCUTS,
  consultShortcutById,
  type ConsultShortcutId,
} from "./consult-shortcuts.ts";

export interface ConsultAssociateContext {
  consultId: string;
  actorId: string;
}

export const CONSULT_ASSOCIATE_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_consult_context",
    description:
      "Read the consult status, notes, transcript availability, and whether the closeout has already been sent. Does not write, send, or end the session.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "run_consult_brief",
    description:
      "Build the existing consult brief snapshot (goals, gaps, engagement, strategy). Read-only. Does not write the Living File, send, or end the session.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "run_fee_estimate",
    description:
      "Run the existing deterministic fee estimate for this file. Returns packages and the phone script. Does not persist a quote, send, or end the session.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "draft_closeout",
    description:
      "Draft the closeout report from notes and transcript using the existing closeout generator. Returns the draft only — does not persist, send to the client, or end the session. The attorney's workbench applies it.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "generate_preconsult_memo",
    description:
      "Generate the existing pre-consult memo onto the Living File. Does not send wrap-up or end the session.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

export async function dispatchConsultAssociateTool(
  name: string,
  ctx: ConsultAssociateContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<string> {
  const { data: consultRow } = await db.from("consult_requests").select("*").eq("id", ctx.consultId).single();
  const consult = consultRow as ConsultRequest | null;
  if (!consult) return JSON.stringify({ error: "Consult not found." });
  if (!consult.case_file_id) return JSON.stringify({ error: "Consult has no linked case file." });

  if (name === "get_consult_context") {
    const [{ data: notes }, { data: recordings }] = await Promise.all([
      db.from("consult_notes").select("id, body, created_at").eq("consult_request_id", ctx.consultId).order("created_at"),
      db.from("consult_recordings").select("id, transcript_status, recorded_at").eq("consult_request_id", ctx.consultId).order("recorded_at"),
    ]);
    return JSON.stringify({
      status: consult.status,
      session_started_at: consult.session_started_at,
      session_ended_at: consult.session_ended_at,
      wrap_up_submitted_at: consult.wrap_up_submitted_at,
      notes: ((notes ?? []) as ConsultNote[]).map((n) => ({ id: n.id, body: n.body, created_at: n.created_at })),
      recordings: ((recordings ?? []) as Pick<ConsultRecording, "id" | "transcript_status" | "recorded_at">[]),
      note: "Do not send wrap-up or end the session. The attorney owns those acts.",
    });
  }

  const { data: caseFileRow } = await db.from("case_files").select("*").eq("id", consult.case_file_id).single();
  if (!caseFileRow) return JSON.stringify({ error: "Case file not found." });
  const caseFile = caseFileRow as CaseFile;

  if (name === "run_consult_brief") {
    const [{ data: facts }, { data: documents }, { data: requested }] = await Promise.all([
      db.from("fact_items").select("*").eq("case_file_id", caseFile.id),
      db.from("documents").select("*").eq("case_file_id", caseFile.id),
      db.from("requested_attachments").select("*").eq("case_file_id", caseFile.id),
    ]);
    const snapshot = buildConsultBriefSnapshot({
      caseFile,
      facts: (facts ?? []) as FactItem[],
      documents: (documents ?? []) as Document[],
      requestedAttachments: (requested ?? []) as RequestedAttachment[],
      consultRequest: consult,
    });
    return JSON.stringify({ ok: true, snapshot });
  }

  if (name === "run_fee_estimate") {
    const [{ data: facts }, { data: documents }, { data: requested }] = await Promise.all([
      db.from("fact_items").select("*").eq("case_file_id", caseFile.id),
      db.from("documents").select("*").eq("case_file_id", caseFile.id),
      db.from("requested_attachments").select("*").eq("case_file_id", caseFile.id),
    ]);
    const estimate = buildConsultFeeEstimate({
      caseFile,
      facts: (facts ?? []) as FactItem[],
      documents: (documents ?? []) as Document[],
      requestedAttachments: (requested ?? []) as RequestedAttachment[],
    });
    return JSON.stringify({
      ok: true,
      complexity: estimate.complexity,
      packages: estimate.packages.map((pkg) => ({
        id: pkg.id,
        label: pkg.label,
        billingModel: pkg.billingModel,
        range: pkg.range,
        recommended: pkg.recommended ?? false,
        fitNote: pkg.fitNote,
      })),
      phoneScript: estimate.phoneScript,
      ethicsNotice: estimate.ethicsNotice,
      caveats: estimate.caveats,
      note: "Not a binding quote. Do not send it. The attorney discusses it.",
    });
  }

  if (name === "draft_closeout") {
    try {
      const wrapUp = await buildConsultCloseoutDraft(db, ctx.consultId, ctx.actorId);
      return JSON.stringify({
        ok: true,
        wrapUp,
        note: "Draft only. Put this wrapUp in your JSON response so the workbench can apply it. Do not send it.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ error: message });
    }
  }

  if (name === "generate_preconsult_memo") {
    try {
      const result = await generatePreConsultMemo(db, caseFile.id, ctx.actorId);
      return JSON.stringify({
        ok: true,
        truncated: result.truncated,
        memo: result.memo.slice(0, 4000),
        note: "Memo is on the Living File. Summarize the weak spots. Do not send wrap-up.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ error: message });
    }
  }

  return JSON.stringify({ error: `Unknown tool ${name}` });
}

export async function runConsultAssociateShortcut(
  id: ConsultShortcutId,
  ctx: ConsultAssociateContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<string | null> {
  if (id === "explain") return null;
  const tools: Record<string, string> = {
    brief: "run_consult_brief",
    fee: "run_fee_estimate",
    closeout: "draft_closeout",
    memo: "generate_preconsult_memo",
  };
  const tool = tools[id];
  if (!tool) return null;
  return dispatchConsultAssociateTool(tool, ctx, db);
}
