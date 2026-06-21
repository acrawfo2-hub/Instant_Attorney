import type {
  CaseFile,
  Document,
  FactItem,
  GovFormInstrument,
  RequestedAttachment,
  WizardType,
} from "./types.ts";
import { WIZARD_LABELS, coerceWizardType } from "./types.ts";
import { computeNextStep, type NextStepGuide } from "./next-step.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Mission Control — ranked open actions on top of the Living File.
//
// Preserves computeNextStep as the hero (highest-leverage document action).
// Secondary rows surface gaps, uploads, and forms without replacing strategy,
// instruments, or the detailed cards below.
// ─────────────────────────────────────────────────────────────────────────────

export type MissionActionKind =
  | "gap"
  | "upload"
  | "form"
  | "document"
  | "chat"
  | "consult";

export type MissionActionStatus = "open" | "in_progress" | "done" | "blocked";

export interface MissionActionLink {
  label: string;
  href: string;
}

export interface MissionAction {
  id: string;
  kind: MissionActionKind;
  status: MissionActionStatus;
  priority: number;
  title: string;
  reason?: string;
  /** Client-facing button / link */
  cta?: MissionActionLink;
  /** Attorney-facing jump link into the Living File */
  jumpTo?: string;
  /** For inline gap answers (client mode) */
  factId?: string;
}

export interface MissionControlBoard {
  hero: NextStepGuide;
  actions: MissionAction[];
  /** Open + in_progress rows shown in the queue (excludes hero duplicate) */
  openCount: number;
  completedCount: number;
}

export interface MissionControlInput {
  caseFile: CaseFile;
  documents: Document[];
  facts: FactItem[];
  requestedAttachments?: RequestedAttachment[];
  govForms?: GovFormInstrument[];
  mode?: "client" | "attorney";
}

const MAX_OPEN_ROWS = 5;
const MAX_GAPS = 3;
const MAX_UPLOADS = 3;
const MAX_FORMS = 2;

function hasDraftText(d: Document): boolean {
  return !!d.draft_text && d.draft_text.trim().length > 0;
}

function wizardHref(caseFileId: string, wType: WizardType, docId?: string): string {
  const base = `/wizard/${wType}?caseFileId=${caseFileId}`;
  return docId ? `${base}&docId=${docId}` : base;
}

function pickCreateTarget(caseFile: CaseFile): WizardType {
  const recommended = (caseFile.legal_strategy?.recommended_wizards ?? [])
    .map(coerceWizardType)
    .filter((w): w is WizardType => w !== null);
  return recommended[0] ?? "general_document";
}

function heroHref(hero: NextStepGuide): string | undefined {
  return hero.cta?.href ?? hero.secondary?.href;
}

function isDuplicateHref(href: string | undefined, hero: NextStepGuide): boolean {
  if (!href) return true;
  return href === hero.cta?.href || href === hero.secondary?.href;
}

function adjustHeroForWaiting(hero: NextStepGuide): NextStepGuide {
  if (hero.tone !== "waiting") return hero;
  return {
    ...hero,
    eyebrow: "While you wait",
    body:
      "Andrew Crawford, Esq. is reviewing your document — you'll get an email within 48 hours. " +
      "You can strengthen your file in the meantime using the actions below.",
  };
}

/**
 * Build the Mission Control board: hero next step + ranked secondary actions.
 */
export function computeMissionControl(input: MissionControlInput): MissionControlBoard {
  const {
    caseFile,
    documents,
    facts,
    requestedAttachments = [],
    govForms = [],
    mode = "client",
  } = input;
  const isAttorney = mode === "attorney";
  const id = caseFile.id;

  const hero = adjustHeroForWaiting(computeNextStep(caseFile, documents, facts));

  const actions: MissionAction[] = [];
  const canCreate =
    (caseFile.legal_strategy?.recommended_wizards ?? []).some((w) => coerceWizardType(w) !== null) ||
    (caseFile.legal_strategy?.instruments?.length ?? 0) > 0;

  // ── Tier 1: Additional document instruments (when not the hero) ─────────────
  const recommended = (caseFile.legal_strategy?.recommended_wizards ?? [])
    .map(coerceWizardType)
    .filter((w): w is WizardType => w !== null);

  for (let i = 1; i < recommended.length; i++) {
    const wType = recommended[i];
    const href = wizardHref(id, wType);
    if (isDuplicateHref(href, hero)) continue;
    const existing = documents.find((d) => d.doc_type === wType && hasDraftText(d));
    if (existing?.status === "approved" || existing?.status === "delivered") continue;

    actions.push({
      id: `doc-wizard:${wType}`,
      kind: "document",
      status: existing ? "in_progress" : "open",
      priority: 12,
      title: existing
        ? `Continue your ${WIZARD_LABELS[wType]}`
        : `Create your ${WIZARD_LABELS[wType]}`,
      cta: isAttorney
        ? undefined
        : { label: existing ? "Continue →" : "Start →", href },
      jumpTo: "#documents",
    });
  }

  // Pending review: promote "another document" into the queue if not already hero secondary
  const pendingDoc = documents.find((d) => d.status === "pending_review");
  if (pendingDoc && canCreate && hero.tone === "waiting") {
    const wType = pickCreateTarget(caseFile);
    const href = wizardHref(id, wType);
    if (!isDuplicateHref(href, hero)) {
      actions.push({
        id: `doc-another:${wType}`,
        kind: "document",
        status: "open",
        priority: 14,
        title: `Start another document (${WIZARD_LABELS[wType]})`,
        reason: "Optional — while your first document is in review",
        cta: isAttorney ? undefined : { label: "Start →", href },
        jumpTo: "#documents",
      });
    }
  }

  // ── Tier 2: Fact gaps ───────────────────────────────────────────────────────
  const gaps = facts.filter((f) => f.status === "gap");
  for (const gap of gaps.slice(0, MAX_GAPS)) {
    actions.push({
      id: `gap:${gap.id}`,
      kind: "gap",
      status: "open",
      priority: 20,
      title: isAttorney ? `Missing: ${gap.description}` : gap.description,
      reason: isAttorney
        ? "Client has not provided this detail yet"
        : "Adds to your Living File and improves your documents",
      cta: isAttorney
        ? undefined
        : { label: "Answer →", href: `#gap-${gap.id}` },
      jumpTo: "#fact-gaps",
      factId: gap.id,
    });
  }
  if (gaps.length > MAX_GAPS) {
    actions.push({
      id: "gap:more",
      kind: "gap",
      status: "open",
      priority: 21,
      title: `${gaps.length - MAX_GAPS} more detail${gaps.length - MAX_GAPS === 1 ? "" : "s"} needed`,
      cta: isAttorney ? undefined : { label: "See all →", href: "#fact-gaps" },
      jumpTo: "#fact-gaps",
    });
  }

  // ── Tier 3: Requested uploads ───────────────────────────────────────────────
  const pendingUploads = requestedAttachments.filter((r) => r.status === "requested");
  for (const req of pendingUploads.slice(0, MAX_UPLOADS)) {
    actions.push({
      id: `upload:${req.id}`,
      kind: "upload",
      status: "open",
      priority: 30,
      title: isAttorney ? `Awaiting upload: ${req.description}` : `Upload: ${req.description}`,
      reason: req.reason ?? undefined,
      cta: isAttorney ? undefined : { label: "Upload →", href: "#attachments" },
      jumpTo: "#attachments",
    });
  }
  if (pendingUploads.length > MAX_UPLOADS) {
    actions.push({
      id: "upload:more",
      kind: "upload",
      status: "open",
      priority: 31,
      title: `${pendingUploads.length - MAX_UPLOADS} more upload${pendingUploads.length - MAX_UPLOADS === 1 ? "" : "s"} requested`,
      cta: isAttorney ? undefined : { label: "See checklist →", href: "#attachments" },
      jumpTo: "#attachments",
    });
  }

  // ── Tier 4: Government forms ────────────────────────────────────────────────
  const openForms = govForms.filter((f) => f.status === "needed" || f.status === "in_progress");
  for (const form of openForms.slice(0, MAX_FORMS)) {
    const title = form.form_def?.title ?? form.form_key;
    const looking = form.source === "dynamic" && form.lookup_status === "pending";
    const fieldCount = form.form_def?.fields?.length ?? 0;
    const guidable = fieldCount > 0;

    actions.push({
      id: `form:${form.id}`,
      kind: "form",
      status: form.status === "in_progress" ? "in_progress" : looking ? "blocked" : "open",
      priority: 40,
      title: isAttorney ? `Form outstanding: ${title}` : `Complete: ${title}`,
      reason: looking
        ? "Looking up official form details…"
        : form.reason ?? undefined,
      cta: isAttorney
        ? undefined
        : guidable
          ? {
              label: form.status === "in_progress" ? "Continue →" : "Start form →",
              href: `/forms/${form.id}`,
            }
          : form.form_def?.official_url
            ? { label: "Open official form ↗", href: form.form_def.official_url }
            : { label: "View forms →", href: "#gov-forms" },
      jumpTo: "#gov-forms",
    });
  }

  // ── Tier 5: Chat escape hatch (when not hero) ───────────────────────────────
  const chatHref = `/chat?caseFileId=${id}`;
  if (!isDuplicateHref(chatHref, hero) && !isAttorney) {
    actions.push({
      id: "chat:continue",
      kind: "chat",
      status: "open",
      priority: 60,
      title: "Continue your private chat",
      reason: "Share more context — your Living File updates as you talk",
      cta: { label: "Open chat →", href: chatHref },
      jumpTo: undefined,
    });
  }

  // ── Attorney: link to review when doc pending ───────────────────────────────
  if (isAttorney && pendingDoc) {
    actions.unshift({
      id: `atty-review:${pendingDoc.id}`,
      kind: "document",
      status: "open",
      priority: 5,
      title: `Review submitted: ${pendingDoc.title}`,
      cta: { label: "Open review →", href: `/attorney/review/${pendingDoc.id}` },
    });
  }

  // Sort, dedupe by id, cap visible open rows
  const sorted = actions.sort((a, b) => a.priority - b.priority);
  const openActions = sorted.filter((a) => a.status !== "done").slice(0, MAX_OPEN_ROWS);

  const completedUploads = requestedAttachments.filter((r) => r.status === "uploaded").length;
  const completedForms = govForms.filter((f) => f.status === "completed").length;
  const confirmedCount = facts.filter((f) => f.status === "confirmed").length;
  const completedCount = completedUploads + completedForms + confirmedCount;

  return {
    hero,
    actions: openActions,
    openCount: openActions.filter((a) => a.status === "open" || a.status === "in_progress").length,
    completedCount,
  };
}
