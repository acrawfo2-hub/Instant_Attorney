import type { CaseFile, Document, FactItem, WizardType } from "@/lib/types";
import { isValidWizardType } from "@/lib/document-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Next-Step engine
//
// A single, plain-language source of truth for "what should I do next?" on a
// case file. This powers the friendly guidance LAYER that sits on top of the
// existing Living File — it never replaces the detailed cards, it just tells a
// lay person, in one obvious place, exactly what to click next.
//
// Core principle (matches the doc generator): nothing is ever a dead end.
// Even with no strategy and no facts, the user always gets a way to move
// forward — including a way to generate a document with placeholders.
// ─────────────────────────────────────────────────────────────────────────────

/** The five plainly-worded stages every file moves through. */
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
}

function hasDraftText(d: Document): boolean {
  return !!d.draft_text && d.draft_text.trim().length > 0;
}

function wizardHref(caseFileId: string, wType: WizardType, docId?: string): string {
  const base = `/wizard/${wType}?caseFileId=${caseFileId}`;
  return docId ? `${base}&docId=${docId}` : base;
}

/**
 * Pick the document type to offer when the user is starting fresh.
 * Prefers the attorney-recommended wizard; otherwise falls back to a general
 * legal document so the path is NEVER blocked.
 */
function pickCreateTarget(
  caseFile: CaseFile,
  preWarmedByType: Record<string, string>,
): { wType: WizardType; docId?: string } {
  const recommended = (caseFile.legal_strategy?.recommended_wizards ?? []).filter(isValidWizardType);
  const wType = recommended[0] ?? "general_document";
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

  // ── Signals ────────────────────────────────────────────────────────────────
  const hasStory = facts.length > 0 || !!caseFile.legal_strategy;
  const canCreate =
    (caseFile.legal_strategy?.recommended_wizards ?? []).some(isValidWizardType) ||
    (caseFile.legal_strategy?.instruments?.length ?? 0) > 0;

  const draftDoc = documents.find((d) => d.status === "draft" && hasDraftText(d));
  const changesDoc = documents.find((d) => d.status === "changes_requested");
  const pendingDoc = documents.find((d) => d.status === "pending_review");
  const approvedDoc = documents.find((d) => d.status === "approved" || d.status === "delivered");
  const anyDocCreated = documents.some(hasDraftText);

  // ── Per-stage completion (independent of the chosen action) ──────────────────
  const stepDone = [
    hasStory, // 1 Tell your story
    anyDocCreated, // 2 Create your document
    documents.some((d) =>
      ["pending_review", "approved", "delivered", "changes_requested"].includes(d.status),
    ), // 3 Send to your attorney
    documents.some((d) => d.status === "approved" || d.status === "delivered"), // 4 Attorney review
    false, // 5 Get your document — always the finish line, never auto-checked
  ];

  // ── Choose the one next action ───────────────────────────────────────────────
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
    cta = { label: "Open my draft →", href: wizardHref(id, draftDoc.doc_type as WizardType, draftDoc.id) };
  } else if (changesDoc) {
    activeStep = 3;
    title = "Your attorney suggested some changes";
    body =
      "Andrew reviewed your document and asked for a few updates. Open it to see what he suggested and send it back when you're ready.";
    cta = { label: "See the changes →", href: wizardHref(id, changesDoc.doc_type as WizardType, changesDoc.id) };
  } else if (canCreate && !anyDocCreated) {
    const { wType, docId } = pickCreateTarget(caseFile, preWarmedByType);
    activeStep = 2;
    title = "Create your first document";
    body =
      "We have enough to start. Click below and we'll write a complete first draft for you in under two minutes — even if some details are still missing, we'll mark those spots so you (or Andrew) can fill them in later.";
    cta = { label: "Create my document →", href: wizardHref(id, wType, docId) };
  } else if (pendingDoc) {
    activeStep = 4;
    tone = "waiting";
    title = "Your attorney is reviewing your document";
    body =
      "Nice work — you've sent your document to Andrew Crawford, Esq. He'll review it within 48 hours and you'll get an email when it's ready. There's nothing you need to do right now.";
    if (canCreate) {
      secondary = (() => {
        const { wType, docId } = pickCreateTarget(caseFile, preWarmedByType);
        return { label: "Start another document", href: wizardHref(id, wType, docId) };
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
    cta = { label: "Create a document →", href: wizardHref(id, wType, docId) };
  } else {
    // No strategy yet — but NEVER a dead end. Keep talking OR jump straight to a draft.
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
    state: stepDone[i] ? "done" : i + 1 === activeStep ? "current" : "upcoming",
  }));

  const eyebrow =
    tone === "waiting" ? "Nothing to do right now" : tone === "done" ? "All done" : "Here's what to do next";

  return { activeStep, steps, eyebrow, title, body, tone, cta, secondary };
}
