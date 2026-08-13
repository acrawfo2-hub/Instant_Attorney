import type { CaseFile, Document, FactItem, WizardType } from "@/lib/types";
import { WIZARD_LABELS } from "@/lib/types";
import { isValidWizardType } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Next-Step engine
//
// A single, plain-language source of truth for "what should I do next?" on a
// case file. This powers the friendly guidance LAYER that sits on top of the
// existing Living File — it never replaces the detailed cards, it just tells a
// lay person, in one obvious place, exactly what to click next.
//
// A file is usually MORE than one document: the attorney strategy ranks several
// instruments. We drive ONE document — the "lead" (most important) — all the way
// to attorney approval via the 5-step spine, while a roadmap shows the user the
// other documents in their file so they know there's more to come. The lead is
// the AI's top-ranked wizard unless the attorney overrides it.
//
// Core principle (matches the doc generator): nothing is ever a dead end.
// Even with no strategy and no facts, the user always gets a way to move
// forward — including a way to generate a document with placeholders.
// ─────────────────────────────────────────────────────────────────────────────

/** The five plainly-worded stages every document moves through. */
export const STEP_LABELS = [
  "Tell your story",
  "Create your document",
  "Send to your attorney",
  "Attorney review",
  "Get your document",
] as const;

export type StepState = "done" | "current" | "upcoming";

export interface SpineStep {
  label: string;
  state: StepState;
}

export interface NextStepLink {
  label: string;
  href: string;
}

export type NextStepTone = "action" | "waiting" | "done";

/** Where a single planned document sits in its journey to approval. */
export type PlanStatus =
  | "not_started"
  | "in_progress"
  | "sent"
  | "changes_requested"
  | "approved";

/** One document in the file's overall strategy, with its current status. */
export interface PlanItem {
  /** Stable identity — the PlanEntry.key (or the wizard type on the legacy path). */
  key: string;
  /** Drafting engine — selects interview hints / formatting only. */
  wizard: WizardType;
  /** Display name (the document's real title). */
  label: string;
  /** Instrument name to pass to a general_document draft, if applicable. */
  instrument?: string;
  /** 1-indexed priority — 1 is the lead (most important) document. */
  priority: number;
  status: PlanStatus;
  /** The top-level document id, if one has been created for this item. */
  docId?: string;
  /** True for the single lead/most-important document. */
  isLead: boolean;
}

export interface NextStepGuide {
  /** 1-indexed active stage (1–5), used for the progress spine. */
  activeStep: number;
  steps: SpineStep[];
  eyebrow: string;
  title: string;
  body: string;
  tone: NextStepTone;
  cta?: NextStepLink;
  secondary?: NextStepLink;
  /** The full ranked document plan for the file (empty before a strategy exists). */
  plan: PlanItem[];
  /** Position of the document the spine is currently tracking, for "X of N" UI. */
  activeDocPosition?: { index: number; total: number };
}

function hasDraftText(d: Document): boolean {
  return !!d.draft_text && d.draft_text.trim().length > 0;
}

/**
 * Where a document action goes now: the case conversation.
 *
 * These used to build `/wizard/<type>?...` links. The wizard was a second
 * drafting client; the orchestrator is the one surface, and the drafting engine
 * (lib/document-drafting.ts) sits behind it. `ask` only seeds the composer — the
 * client reads it and presses send.
 */
function documentActionHref(
  caseFileId: string,
  label: string,
  opts: { docId?: string } = {},
): string {
  const params = new URLSearchParams({ caseFileId });
  if (opts.docId) params.set("doc", opts.docId);
  params.set("ask", opts.docId ? `Let's work on my ${label}.` : `Please draft my ${label}.`);
  return `/chat?${params.toString()}`;
}

function wizardHref(
  caseFileId: string,
  wType: WizardType,
  opts: { docId?: string; instrument?: string; planKey?: string } = {},
): string {
  return documentActionHref(caseFileId, opts.instrument || WIZARD_LABELS[wType], { docId: opts.docId });
}

/** Build the wizard link for a plan item. Pre-warm only applies to legacy
 *  engine-keyed items (a pre-warmed draft has no plan key, so it can't be
 *  safely attached to a specific named instrument). */
function planItemHref(
  caseFileId: string,
  item: PlanItem,
  preWarmedByType: Record<string, string>,
): string {
  const preWarm = item.key === item.wizard ? preWarmedByType[item.wizard] : undefined;
  return wizardHref(caseFileId, item.wizard, {
    docId: item.docId ?? preWarm,
    instrument: item.instrument,
    planKey: item.key,
  });
}

/** The effective lead document key: attorney override wins over the AI ranking. */
export function effectiveLeadKey(caseFile: CaseFile): string | null {
  const plan = caseFile.legal_strategy?.document_plan;
  if (!plan?.length) return null;
  const override = caseFile.legal_strategy?.lead_key_override;
  if (override && plan.some((e) => e.key === override)) return override;
  return plan[0].key;
}

/** The effective lead document type (legacy, recommended_wizards path only). */
export function effectiveLeadWizard(caseFile: CaseFile): WizardType | null {
  const recommended = (caseFile.legal_strategy?.recommended_wizards ?? []).filter(isValidWizardType);
  const override = caseFile.legal_strategy?.lead_override;
  if (override && isValidWizardType(override)) return override;
  return recommended[0] ?? null;
}

/** Map a document's lifecycle status to its place in the plan journey. */
function planStatusForDoc(doc: Document | undefined): PlanStatus {
  if (!doc) return "not_started";
  switch (doc.status) {
    case "approved":
    case "delivered":
      return "approved";
    case "changes_requested":
      return "changes_requested";
    case "pending_review":
      return "sent";
    case "draft":
      return hasDraftText(doc) ? "in_progress" : "not_started";
    default:
      // anything else: nothing the user has touched yet
      return "not_started";
  }
}

/** The plan_key a document was stamped with, if any (lives in content_json). */
function docPlanKey(doc: Document): string | undefined {
  const k = (doc.content_json as Record<string, unknown> | null)?.plan_key;
  return typeof k === "string" ? k : undefined;
}

function docInstrumentKey(doc: Document): string | undefined {
  const metadataKey = (doc.content_json as Record<string, unknown> | null)?.instrument_key;
  return doc.instrument_key ?? (typeof metadataKey === "string" ? metadataKey : undefined) ?? undefined;
}

/**
 * Build the file's ranked document plan. Prefers the structured
 * `document_plan` (each entry tracked by its stable key, so several custom
 * documents that share the general_document engine stay distinct); falls back
 * to the legacy recommended_wizards list for files created before the plan
 * existed. The lead (attorney override, else AI's top pick) is always priority 1.
 * Returns [] before any strategy exists.
 */
export function buildDocumentPlan(caseFile: CaseFile, documents: Document[]): PlanItem[] {
  const topLevel = documents.filter((d) => !d.parent_document_id);
  const plan = caseFile.legal_strategy?.document_plan;

  // ── Preferred path: structured document plan, tracked by stable key ──────────
  if (plan?.length) {
    const leadKey = effectiveLeadKey(caseFile);
    const ordered = [...plan].sort((a, b) => {
      if (a.key === leadKey) return -1;
      if (b.key === leadKey) return 1;
      return 0;
    });

    return ordered.map((entry, i) => {
      // Match by stamped plan_key; fall back to a legacy doc of the same typed
      // engine that was never stamped (best-effort for files mid-migration).
      const doc =
        topLevel.find((d) => docInstrumentKey(d) === entry.instrument_key) ??
        topLevel.find((d) => docPlanKey(d) === entry.key) ??
        (entry.engine !== "general_document"
          ? topLevel.find((d) => d.doc_type === entry.engine && !docPlanKey(d))
          : undefined);
      return {
        key: entry.key,
        wizard: entry.engine,
        label: entry.title,
        instrument: entry.engine === "general_document" ? entry.title : undefined,
        priority: i + 1,
        status: planStatusForDoc(doc),
        docId: doc?.id,
        isLead: entry.key === leadKey,
      };
    });
  }

  // ── Legacy path: derive from the deprecated recommended_wizards list ─────────
  const recommended = (caseFile.legal_strategy?.recommended_wizards ?? []).filter(isValidWizardType);
  if (!recommended.length) return [];

  const lead = effectiveLeadWizard(caseFile);
  const orderedWizards: WizardType[] = [];
  if (lead) orderedWizards.push(lead);
  for (const w of recommended) {
    if (!orderedWizards.includes(w)) orderedWizards.push(w);
  }

  return orderedWizards.map((wizard, i) => {
    const doc = topLevel.find((d) => d.doc_type === wizard);
    return {
      key: wizard,
      wizard,
      label: WIZARD_LABELS[wizard],
      priority: i + 1,
      status: planStatusForDoc(doc),
      docId: doc?.id,
      isLead: wizard === lead,
    };
  });
}

/**
 * Pick the document type to offer when the user is starting fresh and there is
 * no ranked plan. Prefers the attorney-recommended lead wizard; otherwise falls
 * back to a general legal document so the path is NEVER blocked.
 */
function pickCreateTarget(
  caseFile: CaseFile,
  preWarmedByType: Record<string, string>,
): { wType: WizardType; docId?: string } {
  const wType = effectiveLeadWizard(caseFile) ?? "general_document";
  return { wType, docId: preWarmedByType[wType] };
}

/**
 * Compute the single most useful "next step" for a case file, in plain language.
 *
 * @param caseFile          the file
 * @param documents         top-level (non pre-warmed, non-child) documents
 * @param facts             fact items for the file
 * @param preWarmedByType   map of wizardType -> pre-warmed document id
 */
export function computeNextStep(
  caseFile: CaseFile,
  documents: Document[],
  facts: FactItem[],
  preWarmedByType: Record<string, string> = {},
): NextStepGuide {
  const id = caseFile.id;

  const hasStory = facts.length > 0 || !!caseFile.legal_strategy;
  const plan = buildDocumentPlan(caseFile, documents);

  // ── Multi-document path: drive the active document to approval ───────────────
  // The active document is the lead until it's approved, then the next-highest
  // priority document that still needs work. This keeps the spine honest (it
  // tracks ONE real document) instead of averaging unrelated documents together.
  if (plan.length) {
    const activeItem = plan.find((p) => p.status !== "approved") ?? plan[plan.length - 1];
    const s = activeItem.status;

    const stepDone = [
      hasStory, // 1 Tell your story (shared across the whole file)
      s !== "not_started", // 2 Create — this document has a draft
      s === "sent" || s === "changes_requested" || s === "approved", // 3 Send
      s === "approved", // 4 Attorney review
      false, // 5 Get your document — the finish line, never auto-checked
    ];

    let activeStep: number;
    let title: string;
    let body: string;
    let tone: NextStepTone = "action";
    let cta: NextStepLink | undefined;
    let secondary: NextStepLink | undefined;

    const nextToStart = plan.find(
      (p) => p.status === "not_started" && p.priority !== activeItem.priority,
    );
    const rationale = caseFile.legal_strategy?.lead_rationale?.trim();

    if (s === "in_progress") {
      activeStep = 3;
      title = `Review your ${activeItem.label} and send it to your attorney`;
      body =
        "Your document is drafted and waiting. Look it over, fill in any blanks you can, then send it to Andrew. It's completely fine to leave blanks — he'll finish them for you.";
      cta = { label: "Open my draft →", href: planItemHref(id, activeItem, preWarmedByType) };
    } else if (s === "changes_requested") {
      activeStep = 3;
      title = `Your attorney suggested changes to your ${activeItem.label}`;
      body =
        "Andrew reviewed this document and asked for a few updates. Open it to see what he suggested and send it back when you're ready.";
      cta = { label: "See the changes →", href: planItemHref(id, activeItem, preWarmedByType) };
    } else if (s === "sent") {
      activeStep = 4;
      tone = "waiting";
      title = `Your attorney is reviewing your ${activeItem.label}`;
      body =
        "Nice work — you've sent this document to Andrew Crawford, Esq. He'll review it within 48 hours and you'll get an email when it's ready. There's nothing you need to do right now.";
      if (nextToStart) {
        secondary = {
          label: `Get a head start on your ${nextToStart.label}`,
          href: planItemHref(id, nextToStart, preWarmedByType),
        };
      }
    } else if (s === "approved") {
      // Reached only when EVERY document in the plan is approved.
      activeStep = 5;
      tone = "done";
      title = plan.length > 1 ? "All your documents are ready" : "Your finished document is ready";
      body =
        "Andrew has reviewed and approved your documents. You can download them below, ready to use. Need something else? You can always start a new document or ask a question.";
      cta = { label: "Get my documents →", href: "#documents" };
    } else {
      // not_started — create this document.
      activeStep = 2;
      if (activeItem.priority === 1) {
        title = activeItem.isLead
          ? `Create your most important document: your ${activeItem.label}`
          : `Create your first document: your ${activeItem.label}`;
        body = rationale
          ? `Your attorney's strategy starts here — ${rationale} We'll write a complete first draft for you in under two minutes; anything still missing gets marked so you (or Andrew) can fill it in later.`
          : "This is the most important document in your file. We'll write a complete first draft for you in under two minutes — even if some details are still missing, we'll mark those spots so you (or Andrew) can fill them in later.";
      } else {
        title = `Create your next document: your ${activeItem.label}`;
        body =
          "Your most important document is moving along — this is the next one in your file's plan. We'll write a complete first draft in under two minutes; missing details are never a problem.";
      }
      cta = {
        label: `Create my ${activeItem.label} →`,
        href: planItemHref(id, activeItem, preWarmedByType),
      };
    }

    const steps: SpineStep[] = STEP_LABELS.map((label, i) => ({
      label,
      state: i + 1 === activeStep ? "current" : stepDone[i] ? "done" : "upcoming",
    }));

    const eyebrow =
      tone === "waiting" ? "Nothing to do right now" : tone === "done" ? "All done" : "Here's what to do next";

    return {
      activeStep,
      steps,
      eyebrow,
      title,
      body,
      tone,
      cta,
      secondary,
      plan,
      activeDocPosition: { index: activeItem.priority, total: plan.length },
    };
  }

  // ── Pre-strategy path: no ranked plan yet, never a dead end ───────────────────
  const canCreate =
    (caseFile.legal_strategy?.recommended_wizards ?? []).some(isValidWizardType) ||
    (caseFile.legal_strategy?.instruments?.length ?? 0) > 0;

  const draftDoc = documents.find((d) => d.status === "draft" && hasDraftText(d));
  const changesDoc = documents.find((d) => d.status === "changes_requested");
  const pendingDoc = documents.find((d) => d.status === "pending_review");
  const approvedDoc = documents.find((d) => d.status === "approved" || d.status === "delivered");
  const anyDocCreated = documents.some(hasDraftText);

  const stepDone = [
    hasStory,
    anyDocCreated,
    documents.some((d) =>
      ["pending_review", "approved", "delivered", "changes_requested"].includes(d.status),
    ),
    documents.some((d) => d.status === "approved" || d.status === "delivered"),
    false,
  ];

  let activeStep: number;
  let title: string;
  let body: string;
  let tone: NextStepTone = "action";
  let cta: NextStepLink | undefined;
  let secondary: NextStepLink | undefined;

  if (draftDoc) {
    activeStep = 3;
    title = "Review your draft and send it to your attorney";
    body =
      "Your document is drafted and waiting. Look it over, fill in any blanks you can, then send it to Andrew. It's completely fine to leave blanks — he'll finish them for you.";
    cta = { label: "Open my draft →", href: wizardHref(id, draftDoc.doc_type as WizardType, { docId: draftDoc.id }) };
  } else if (changesDoc) {
    activeStep = 3;
    title = "Your attorney suggested some changes";
    body =
      "Andrew reviewed your document and asked for a few updates. Open it to see what he suggested and send it back when you're ready.";
    cta = { label: "See the changes →", href: wizardHref(id, changesDoc.doc_type as WizardType, { docId: changesDoc.id }) };
  } else if (canCreate && !anyDocCreated) {
    const { wType, docId } = pickCreateTarget(caseFile, preWarmedByType);
    activeStep = 2;
    title = "Create your first document";
    body =
      "We have enough to start. Click below and we'll write a complete first draft for you in under two minutes — even if some details are still missing, we'll mark those spots so you (or Andrew) can fill them in later.";
    cta = { label: "Create my document →", href: wizardHref(id, wType, { docId }) };
  } else if (pendingDoc) {
    activeStep = 4;
    tone = "waiting";
    title = "Your attorney is reviewing your document";
    body =
      "Nice work — you've sent your document to Andrew Crawford, Esq. He'll review it within 48 hours and you'll get an email when it's ready. There's nothing you need to do right now.";
    if (canCreate) {
      secondary = (() => {
        const { wType, docId } = pickCreateTarget(caseFile, preWarmedByType);
        return { label: "Start another document", href: wizardHref(id, wType, { docId }) };
      })();
    }
  } else if (approvedDoc) {
    activeStep = 5;
    tone = "done";
    title = "Your finished document is ready";
    body =
      "Andrew has reviewed and approved your document. You can download it below, ready to use. Need something else? You can always start a new document or ask a question.";
    cta = { label: "Get my document →", href: "#documents" };
  } else if (canCreate) {
    const { wType, docId } = pickCreateTarget(caseFile, preWarmedByType);
    activeStep = 2;
    title = "Create your next document";
    body =
      "We'll write a complete first draft for you in under two minutes. Missing details are never a problem — we mark those spots and your attorney fills them in.";
    cta = { label: "Create a document →", href: wizardHref(id, wType, { docId }) };
  } else {
    activeStep = 1;
    title = "Tell us a little more about your situation";
    body =
      "The more you share in your private chat, the better your documents will be. When you're ready, we can also create a document right now and fill in the rest as we go.";
    cta = { label: "Continue my chat →", href: `/chat?caseFileId=${id}` };
    secondary = {
      label: "Or create a document now",
      href: wizardHref(id, "general_document"),
    };
  }

  const steps: SpineStep[] = STEP_LABELS.map((label, i) => ({
    label,
    state: i + 1 === activeStep ? "current" : stepDone[i] ? "done" : "upcoming",
  }));

  const eyebrow =
    tone === "waiting" ? "Nothing to do right now" : tone === "done" ? "All done" : "Here's what to do next";

  return { activeStep, steps, eyebrow, title, body, tone, cta, secondary, plan };
}
