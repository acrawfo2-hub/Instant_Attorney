import type { Document, RequestedAttachment, GovFormInstrument, Attachment } from "./types.ts";
import { docTypeLabel } from "./types.ts";
import {
  computeMissionControl,
  type MissionAction,
  type MissionControlInput,
} from "./mission-control.ts";
import type { NextStepGuide } from "./next-step.ts";
import { computeDocket, DOCKET_CAVEAT } from "./docket.ts";

/** buildMatterTasks input — Mission Control's input plus the uploaded documents,
 *  so the synthesizer accounts for attachments/screenshots, not just facts. */
export type MatterTasksInput = MissionControlInput & { attachments?: Attachment[] };

// ─────────────────────────────────────────────────────────────────────────────
// Matter tasks — the deterministic skeleton for the "state of your matter"
// synthesizer. A pure transform over computeMissionControl (the ranked action
// board) plus finalized state, bucketed into what's DONE, what's DOABLE NOW, and
// what's BLOCKED, ranked by urgency then impact. No task is invented here — every
// task derives from a real Mission Control action or a real finalized record — so
// the synthesizer's narrative can phrase and order these without hallucinating.
// ─────────────────────────────────────────────────────────────────────────────

export type MatterTaskStatus = "done" | "doable_now" | "blocked";
export type MatterUrgency = "expired" | "critical" | "warning" | "normal";
export type MatterImpact = "high" | "medium" | "low";

export interface MatterTask {
  id: string;
  title: string;
  status: MatterTaskStatus;
  /** Named blockers (a missing fact, a document, or an external wait) when blocked. */
  blockedBy?: string[];
  /** The orchestrator tool that would do this, once tools exist (Phase 3). */
  toolName?: string;
  urgency: MatterUrgency;
  impact: MatterImpact;
  reason?: string;
  /** Deep link into the file, mirrored from the source Mission Control action. */
  href?: string;
}

export interface MatterTasksResult {
  done: MatterTask[];
  doableNow: MatterTask[];
  blocked: MatterTask[];
  /** Flat, fully-ranked list across buckets (doable-now, then blocked, then done). */
  all: MatterTask[];
  counts: { done: number; doableNow: number; blocked: number };
}

// Map a task (by its wording, or the matter's area) to the orchestrator tool that
// would help with it, so a doable-now item can name a runnable tool — the model
// offers to run it, and the UI can surface it. Only fills where a calculator
// clearly fits; most gaps/uploads/document tasks have no tool and stay undefined.
function suggestTool(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\bdeadline\b|statute of limitations|limitations period/.test(t)) return "screen_pi_sol";
  if (/child support/.test(t)) return "estimate_child_support";
  if (/maintenance|alimony|spousal support/.test(t)) return "estimate_maintenance";
  if (/property (division|split)|community (property|estate)|divide the estate/.test(t)) return "estimate_property_split";
  if (/possession|visitation|custody schedule|parenting time/.test(t)) return "possession_schedule";
  if (/means test|chapter 7|bankrupt/.test(t)) return "run_means_test";
  if (/exempt/.test(t)) return "estimate_bankruptcy_exemptions";
  if (/defamation|libel|slander/.test(t)) return "assess_defamation";
  if (/non-?compete|noncompete/.test(t)) return "assess_noncompete";
  if (/probate|living trust|estate plan/.test(t)) return "estimate_probate";
  if (/comparative fault|percent(age)? (of )?fault|at fault/.test(t)) return "estimate_pi_fault";
  return undefined;
}

const URGENCY_RANK: Record<MatterUrgency, number> = { expired: 0, critical: 1, warning: 2, normal: 3 };
const IMPACT_RANK: Record<MatterImpact, number> = { high: 0, medium: 1, low: 2 };

// Mission Control priority (lower = more important) → coarse impact bands.
function impactFromPriority(priority: number): MatterImpact {
  if (priority <= 6) return "high";
  if (priority <= 20) return "medium";
  return "low";
}

// Deterministic urgency heuristic. Time-sensitive handoffs (out-of-state local
// counsel, an attorney-recommended consult) are the pressing ones; gaps/uploads
// that hold up a document are a softer warning. A real statute-of-limitations
// deadline (screenPiSol().urgency) is the intended top signal — slotted in here
// once incident-date facts are structured enough to trust (see plan §5.2).
function urgencyForAction(a: MissionAction): MatterUrgency {
  if (a.id.startsWith("prep:local-counsel")) return "critical";
  if (a.id.startsWith("consult:recommended") || a.id.startsWith("counsel:consult")) return "warning";
  if (a.kind === "gap" || a.kind === "upload") return "warning";
  return "normal";
}

function actionToTask(a: MissionAction): MatterTask {
  // "waiting"/lookup-pending forms are genuinely blocked on an external process;
  // everything else Mission Control surfaces is something the user can act on now.
  const status: MatterTaskStatus = a.status === "blocked" ? "blocked" : "doable_now";
  const task: MatterTask = {
    id: a.id,
    title: a.title,
    status,
    urgency: urgencyForAction(a),
    impact: impactFromPriority(a.priority),
    reason: a.reason,
    href: a.cta?.href,
  };
  if (status === "blocked") {
    task.blockedBy = [a.reason?.trim() || "Waiting on an external step"];
  }
  return task;
}

// Finalized records become the DONE bucket — derived straight from state, not
// from the (open-only) Mission Control board.
function finishedTasks(
  documents: Document[],
  requestedAttachments: RequestedAttachment[],
  govForms: GovFormInstrument[],
): MatterTask[] {
  const done: MatterTask[] = [];
  for (const d of documents) {
    if (d.status === "approved" || d.status === "delivered") {
      done.push({
        id: `done-doc:${d.id}`,
        title: `${d.title || docTypeLabel(d.doc_type)} is finalized`,
        status: "done",
        urgency: "normal",
        impact: "high",
      });
    }
  }
  for (const r of requestedAttachments) {
    if (r.status === "uploaded") {
      done.push({
        id: `done-upload:${r.id}`,
        title: `Provided: ${r.description}`,
        status: "done",
        urgency: "normal",
        impact: "low",
      });
    }
  }
  for (const f of govForms) {
    if (f.status === "completed") {
      done.push({
        id: `done-form:${f.id}`,
        title: `Completed: ${f.form_def?.title ?? f.form_key}`,
        status: "done",
        urgency: "normal",
        impact: "medium",
      });
    }
  }
  return done;
}

// A live deadline is the top urgency signal. The docket engine (lib/docket.ts)
// computes deadlines deterministically from dated trigger facts ("Key date ·
// served_lawsuit · 2026-07-20 — …") and from facts that already carry an
// explicit ISO deadline (the PI SOL screener writes "…filing deadline
// YYYY-MM-DD…"). Each computed entry becomes a high-impact task whose urgency
// reflects how close it is — this is the screenPiSol().urgency signal the plan
// reserved, now generalized across practice areas.
function deadlineTasks(
  facts: MissionControlInput["facts"],
  now: Date,
  jurisdiction?: string | null
): MatterTask[] {
  return computeDocket(facts, now, jurisdiction).map((e) => ({
    // Explicit-deadline facts keep the historical `deadline:<factId>` id;
    // rule-computed entries key on the docket entry (one fact can yield several).
    id: `deadline:${e.event === "explicit_deadline" && e.sourceFactId ? e.sourceFactId : e.id}`,
    title:
      e.daysRemaining < 0
        ? `A key deadline has passed — ${e.label.toLowerCase()} was ${e.deadlineDate}. Talk to your attorney right away`
        : `${e.label}: ${e.deadlineDate} (${e.daysRemaining} day${e.daysRemaining === 1 ? "" : "s"} left)`,
    status: "doable_now" as const,
    urgency: e.urgency,
    impact: "high" as const,
    reason: `${e.explain} Basis: ${e.basis}. ${DOCKET_CAVEAT}`,
  }));
}

// Uploaded documents/screenshots the AI flagged with an urgent finding become
// high-priority attention tasks — so "where things stand" reflects what the
// evidence turned up, not just what the client typed. (The facts those files
// extracted are already first-class fact_items and flow through separately.)
function attachmentTasks(attachments: Attachment[]): MatterTask[] {
  const tasks: MatterTask[] = [];
  for (const a of attachments) {
    if (a.status !== "ready") continue;
    if (a.urgent_findings && a.urgent_findings !== "None identified") {
      tasks.push({
        id: `attach-urgent:${a.id}`,
        title: `Review what ${a.file_name} turned up`,
        status: "doable_now",
        urgency: "critical",
        impact: "high",
        reason: a.urgent_findings,
      });
    }
  }
  return tasks;
}

// The hero next step, when it's an actual action (not the passive "while you
// wait" review state), becomes the top doable-now task.
function heroTask(hero: NextStepGuide): MatterTask | null {
  if (hero.tone === "waiting") return null;
  const href = hero.cta?.href ?? hero.secondary?.href;
  if (!href) return null;
  return {
    id: "hero",
    title: hero.title ?? hero.eyebrow ?? "Your next step",
    status: "doable_now",
    urgency: "normal",
    impact: "high",
    reason: hero.body,
    href,
  };
}

function rank(a: MatterTask, b: MatterTask): number {
  const u = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  if (u !== 0) return u;
  return IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact];
}

/**
 * Build the bucketed, ranked task view of a matter. Pure and deterministic.
 */
export function buildMatterTasks(input: MatterTasksInput): MatterTasksResult {
  const board = computeMissionControl(input);

  const doableNow: MatterTask[] = [];
  const blocked: MatterTask[] = [];

  const hero = heroTask(board.hero);
  if (hero) doableNow.push(hero);

  // Live filing deadlines and attachment-flagged issues rank alongside the open
  // actions — urgency ordering floats the pressing ones to the top of the bucket.
  doableNow.push(...deadlineTasks(input.facts, new Date(), input.caseFile.jurisdiction));
  doableNow.push(...attachmentTasks(input.attachments ?? []));

  for (const action of board.actions) {
    // "more" rollup rows are UI affordances, not real tasks.
    if (action.id.endsWith(":more")) continue;
    const task = actionToTask(action);
    (task.status === "blocked" ? blocked : doableNow).push(task);
  }

  const done = finishedTasks(
    input.documents,
    input.requestedAttachments ?? [],
    input.govForms ?? [],
  );

  // Name a runnable tool for each open task where a calculator clearly fits. Fall
  // back to the matter's own text so at least the top item names a tool when the
  // area is analyzable (e.g. a family matter → estimate_child_support).
  const matterText = `${input.caseFile.matter_subtype ?? ""} ${input.caseFile.summary ?? ""}`;
  const matterTool = suggestTool(matterText);
  for (const task of [...doableNow, ...blocked]) {
    task.toolName = suggestTool(`${task.title} ${task.reason ?? ""}`) ?? undefined;
  }
  if (matterTool) {
    const top = doableNow.find((t) => t.id === "hero") ?? doableNow[0];
    if (top && !top.toolName) top.toolName = matterTool;
  }

  doableNow.sort(rank);
  blocked.sort(rank);

  return {
    done,
    doableNow,
    blocked,
    all: [...doableNow, ...blocked, ...done],
    counts: { done: done.length, doableNow: doableNow.length, blocked: blocked.length },
  };
}
