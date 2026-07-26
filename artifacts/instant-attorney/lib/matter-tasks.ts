import type { Document, RequestedAttachment, GovFormInstrument } from "./types.ts";
import { docTypeLabel } from "./types.ts";
import {
  computeMissionControl,
  type MissionAction,
  type MissionControlInput,
} from "./mission-control.ts";
import type { NextStepGuide } from "./next-step.ts";

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
export function buildMatterTasks(input: MissionControlInput): MatterTasksResult {
  const board = computeMissionControl(input);

  const doableNow: MatterTask[] = [];
  const blocked: MatterTask[] = [];

  const hero = heroTask(board.hero);
  if (hero) doableNow.push(hero);

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
