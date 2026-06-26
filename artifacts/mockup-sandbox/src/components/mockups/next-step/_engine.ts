// Verbatim copy of the main app's lib/next-step.ts engine, with the single
// external dependency (isValidWizardType from lib/document-utils) inlined and
// the lib/types imports replaced by local minimal mirrors. Logic is unchanged
// so the sandbox preview exercises the real state machine.

export type WizardType =
  | "demand_letter"
  | "complaint_letter"
  | "draft_contract"
  | "draft_waiver"
  | "wills_trusts"
  | "doc_review"
  | "general_document";

const VALID_WIZARD_TYPES = new Set<string>([
  "demand_letter",
  "complaint_letter",
  "draft_contract",
  "draft_waiver",
  "wills_trusts",
  "doc_review",
  "general_document",
]);

function isValidWizardType(type: string): type is WizardType {
  return VALID_WIZARD_TYPES.has(type);
}

export interface LegalStrategy {
  recommended_wizards?: WizardType[];
  instruments?: string[];
}

export interface CaseFile {
  id: string;
  legal_strategy?: LegalStrategy | null;
}

export interface Document {
  id: string;
  doc_type: string;
  status: string;
  draft_text?: string | null;
}

export interface FactItem {
  id: string;
}

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

function pickCreateTarget(
  caseFile: CaseFile,
  preWarmedByType: Record<string, string>,
): { wType: WizardType; docId?: string } {
  const recommended = (caseFile.legal_strategy?.recommended_wizards ?? []).filter(isValidWizardType);
  const wType = recommended[0] ?? "general_document";
  return { wType, docId: preWarmedByType[wType] };
}

export function computeNextStep(
  caseFile: CaseFile,
  documents: Document[],
  facts: FactItem[],
  preWarmedByType: Record<string, string> = {},
): NextStepGuide {
  const id = caseFile.id;

  const hasStory = facts.length > 0 || !!caseFile.legal_strategy;
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

  return { activeStep, steps, eyebrow, title, body, tone, cta, secondary };
}
