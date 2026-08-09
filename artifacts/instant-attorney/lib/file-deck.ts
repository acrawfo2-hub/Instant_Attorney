import type {
  Attachment,
  CaseFile,
  ClientWorkspaceDraft,
  ConsultRequest,
  Document,
  FactItem,
  GovFormInstrument,
  RequestedAttachment,
} from "./types.ts";
import { docTypeLabel } from "./types.ts";
import { findBlanks } from "./freestyle-drafts.ts";
import { computeDocket, type DocketEntry } from "./docket.ts";
import type { MatterTasksResult, MatterTask, MatterUrgency } from "./matter-tasks.ts";

// ─────────────────────────────────────────────────────────────────────────────
// The client file's "deck" — the whole matter distilled into the handful of
// things a client actually asks a lawyer, in the order a lawyer answers them:
//
//   1. Am I OK?              → `pressing` (a deadline about to bite)
//   2. What do I do next?    → `nextStep` + `starters` (one action, one button)
//   3. Where are my papers?  → `drafts` (finished work, one tap away)
//   4. Where's everything?   → `tiles` (six fixed destinations, with counts)
//
// Pure and deterministic: every field derives from a real row on the file. This
// exists so the Living File can render as a small set of buttons instead of a
// wall of prose — the detail is still on the page, but it lives behind whichever
// tile names it, and nothing here invents a task Mission Control didn't produce.
// ─────────────────────────────────────────────────────────────────────────────

/** Visual weight of a tile. Drives color only — never hides anything. */
export type TileTone = "urgent" | "attention" | "calm" | "neutral";

/** Icon keyword the renderer maps to an inline SVG. */
export type TileIcon = "documents" | "inbox" | "calendar" | "scales" | "wallet" | "person";

export interface FileTile {
  id: string;
  /** Button label — what the client is looking for, in their words. */
  label: string;
  /** One line of live status underneath. Never empty. */
  status: string;
  /** Badge number, or null when a count would be noise. */
  count: number | null;
  /** In-page anchor (`#documents`) or a route. */
  href: string;
  tone: TileTone;
  icon: TileIcon;
}

/** A piece of finished (or in-flight) work, surfaced so it's never hunted for. */
export interface DraftShortcut {
  id: string;
  title: string;
  /** Plain-language state: "3 blanks to fill", "With your attorney", … */
  meta: string;
  href: string;
  /** True when the client is the one holding this up. */
  needsInfo: boolean;
}

/** A one-tap conversation opener that lands in the composer, pre-typed. */
export interface StarterPrompt {
  /** Short chip label. */
  label: string;
  /** The full sentence dropped into the chat composer. */
  text: string;
}

export interface NextStep {
  /** The single most important open action, phrased for the client. */
  title: string;
  /** Why it matters / what's holding it up, when we know. */
  detail: string | null;
  /** What the assistant should be asked to do about it. */
  ask: string;
  urgency: "expired" | "critical" | "warning" | "normal";
}

export interface PressingDeadline {
  label: string;
  /** "12 days left" / "today" / "passed 3 days ago". */
  countdown: string;
  deadlineDate: string;
  urgency: "expired" | "critical" | "warning";
  ask: string;
}

/** How the client completes an action item without leaving the conversation. */
export type DeckActionKind =
  /** Ask the assistant to do it — the composer opens pre-typed. */
  | "chat"
  /** Open a specific draft in the side panel. */
  | "draft"
  /** Attach a document right here. */
  | "upload";

export interface DeckAction {
  id: string;
  /** What the client is being asked to do, in their words. */
  label: string;
  kind: DeckActionKind;
  /** The sentence sent to the assistant for `chat` (and as a fallback elsewhere). */
  ask: string;
  /** Set when `kind` is "draft". */
  draftId?: string;
  urgency: MatterUrgency;
  /** True once nothing is left for the client to do on this item. */
  blocked: boolean;
}

export interface FileDeck {
  pressing: PressingDeadline | null;
  nextStep: NextStep | null;
  /** Every open item, each carrying the way to complete it from the chat. */
  actions: DeckAction[];
  drafts: DraftShortcut[];
  /** How many drafts/documents exist beyond the ones `drafts` shows. */
  moreDrafts: number;
  tiles: FileTile[];
  starters: StarterPrompt[];
  /** Computed docket size — lets the view skip an empty Key dates section. */
  docketCount: number;
}

export interface FileDeckInput {
  caseFile: CaseFile;
  facts: FactItem[];
  tasks: MatterTasksResult;
  documents: Document[];
  childDocuments?: Document[];
  workspaceDrafts?: ClientWorkspaceDraft[];
  attachments?: Attachment[];
  requestedAttachments?: RequestedAttachment[];
  govForms?: GovFormInstrument[];
  consultRequest?: ConsultRequest | null;
  now?: Date;
}

/** How many finished-work shortcuts ride at the top of the file. */
const DRAFT_SHORTCUT_LIMIT = 3;

const FINALIZED = new Set(["approved", "delivered"]);

function countdownText(daysRemaining: number): string {
  if (daysRemaining < 0) {
    const d = -daysRemaining;
    return `passed ${d} day${d === 1 ? "" : "s"} ago`;
  }
  if (daysRemaining === 0) return "due today";
  return `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`;
}

/** Trim a task title down to something that reads as a sentence on a button. */
function tidy(text: string): string {
  return text.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");
}

/** The blanks still open in a document, following the same original→revised
 *  precedence the documents table uses (a revised draft supersedes the first). */
function documentBlanks(doc: Document, childDocuments: Document[]): number {
  const revised = childDocuments.find(
    (c) => c.parent_document_id === doc.id && c.doc_type === "second_draft",
  );
  const target = revised?.draft_text ? revised : doc.draft_text ? doc : null;
  return target?.draft_text ? findBlanks(target.draft_text).length : 0;
}

/** Join status fragments into one line, capped so a tile stays one line tall. */
function statusLine(parts: string[], fallback: string, max = 2): string {
  const kept = parts.filter(Boolean).slice(0, max);
  return kept.length ? kept.join(" · ") : fallback;
}

function toneForUrgency(u: DocketEntry["urgency"]): TileTone {
  if (u === "expired" || u === "critical") return "urgent";
  if (u === "warning") return "attention";
  return "neutral";
}

// ── Drafts ───────────────────────────────────────────────────────────────────
//
// "She should not have to look hard for drafts already done." Ordering is by how
// much the client's own attention is needed: her blanks first, then work she can
// read, then work that's sitting with the attorney, then what's already final.

function buildDrafts(
  caseFileId: string,
  workspaceDrafts: ClientWorkspaceDraft[],
  documents: Document[],
  childDocuments: Document[],
): { drafts: DraftShortcut[]; more: number } {
  type Ranked = DraftShortcut & { rank: number; sortKey: string };
  const all: Ranked[] = [];

  // Side-panel drafts written with the assistant — the ones she'd go looking for.
  for (const d of workspaceDrafts) {
    if (d.promoted_document_id) continue; // now tracked as a document, below
    const blanks = d.content ? findBlanks(d.content).length : 0;
    const empty = !d.content?.trim();
    all.push({
      id: `wsdraft:${d.id}`,
      title: d.title || "Untitled draft",
      meta: empty
        ? "Started — nothing written yet"
        : blanks > 0
          ? `${blanks} blank${blanks === 1 ? "" : "s"} to fill`
          : "Ready to read",
      href: `/chat?caseFileId=${caseFileId}&draft=${d.id}`,
      needsInfo: blanks > 0,
      rank: blanks > 0 ? 0 : empty ? 3 : 1,
      sortKey: d.updated_at,
    });
  }

  for (const doc of documents) {
    const blanks = documentBlanks(doc, childDocuments);
    let meta: string;
    let rank: number;
    if (doc.status === "changes_requested") {
      meta = "Your attorney asked for changes";
      rank = 0;
    } else if (blanks > 0) {
      meta = `${blanks} blank${blanks === 1 ? "" : "s"} to fill`;
      rank = 0;
    } else if (doc.status === "pending_review") {
      meta = "With your attorney";
      rank = 2;
    } else if (FINALIZED.has(doc.status)) {
      meta = doc.status === "delivered" ? "Delivered" : "Approved — ready to use";
      rank = 4;
    } else {
      meta = "Ready to read";
      rank = 1;
    }
    all.push({
      id: `doc:${doc.id}`,
      title: doc.title || docTypeLabel(doc.doc_type),
      meta,
      href: `#doc-${doc.id}`,
      needsInfo: blanks > 0 || doc.status === "changes_requested",
      rank,
      sortKey: doc.created_at,
    });
  }

  all.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : b.sortKey.localeCompare(a.sortKey)));

  const drafts = all.slice(0, DRAFT_SHORTCUT_LIMIT).map(({ rank: _r, sortKey: _s, ...rest }) => rest);
  return { drafts, more: Math.max(0, all.length - drafts.length) };
}

// ── Tiles ────────────────────────────────────────────────────────────────────
//
// Six tiles, always the same six in the same order. Counts and status change;
// the map doesn't. A client learns where things live once and never re-learns —
// which is exactly what a conditional, self-rearranging grid would cost her.

function buildTiles(input: FileDeckInput, docket: DocketEntry[]): FileTile[] {
  const {
    caseFile,
    documents,
    childDocuments = [],
    workspaceDrafts = [],
    requestedAttachments = [],
    govForms = [],
    facts,
    consultRequest,
  } = input;

  const openDrafts = workspaceDrafts.filter((d) => !d.promoted_document_id);
  const inReview = documents.filter((d) => d.status === "pending_review");
  const finished = documents.filter((d) => FINALIZED.has(d.status));
  const working = documents.filter((d) => !FINALIZED.has(d.status) && d.status !== "pending_review");

  // ① Your documents
  const docTotal = openDrafts.length + documents.length;
  const docParts = [
    openDrafts.length + working.length > 0
      ? `${openDrafts.length + working.length} working draft${openDrafts.length + working.length === 1 ? "" : "s"}`
      : "",
    inReview.length > 0 ? `${inReview.length} with your attorney` : "",
    finished.length > 0 ? `${finished.length} finished` : "",
  ];

  // ② Needs your info — everything the matter is waiting on *her* for.
  const blankCount =
    openDrafts.reduce((n, d) => n + (d.content ? findBlanks(d.content).length : 0), 0) +
    documents.reduce((n, d) => n + documentBlanks(d, childDocuments), 0);
  const uploadsWanted = requestedAttachments.filter((r) => r.status !== "uploaded").length;
  const formsOpen = govForms.filter((f) => f.status !== "completed" && f.status !== "dismissed").length;
  const needTotal = blankCount + uploadsWanted + formsOpen;
  const needParts = [
    blankCount > 0 ? `${blankCount} blank${blankCount === 1 ? "" : "s"} to fill` : "",
    uploadsWanted > 0 ? `${uploadsWanted} document${uploadsWanted === 1 ? "" : "s"} to upload` : "",
    formsOpen > 0 ? `${formsOpen} form${formsOpen === 1 ? "" : "s"} to complete` : "",
  ];

  // ③ Key dates
  const nextDate = docket[0] ?? null;

  // ④ Your case details
  const confirmed = facts.filter((f) => f.status === "confirmed").length;
  const goals = (caseFile.goals as string[] | null)?.length ?? 0;

  // ⑥ Talk to a person
  let personStatus = "Questions? Reach the firm by email";
  let personTone: TileTone = "neutral";
  if (consultRequest?.status === "confirmed") {
    personStatus = "Your consult is confirmed";
    personTone = "calm";
  } else if (consultRequest?.status === "attorney_proposed") {
    personStatus = "A new time was proposed — respond";
    personTone = "attention";
  } else if (consultRequest?.status === "pending") {
    personStatus = "Waiting on the firm to confirm a time";
    personTone = "neutral";
  } else if (caseFile.legal_strategy?.recommend_consult) {
    personStatus = "Your attorney suggests a live call";
    personTone = "attention";
  }

  return [
    {
      id: "documents",
      label: "Your documents",
      status: statusLine(docParts, "Nothing drafted yet — ask your assistant to start one"),
      count: docTotal || null,
      href: "#documents",
      tone: "neutral",
      icon: "documents",
    },
    {
      id: "needs-info",
      label: "Needs your info",
      status: statusLine(needParts, "You're all caught up — nothing is waiting on you"),
      count: needTotal || null,
      href: "#documents",
      tone: needTotal > 0 ? "attention" : "calm",
      icon: "inbox",
    },
    {
      id: "deadlines",
      label: "Key dates",
      status: nextDate
        ? `${nextDate.label} — ${countdownText(nextDate.daysRemaining)}`
        : "No deadlines computed from your file yet",
      count: docket.length || null,
      href: "#deadlines",
      tone: nextDate ? toneForUrgency(nextDate.urgency) : "neutral",
      icon: "calendar",
    },
    {
      id: "case-details",
      label: "Your case details",
      status: statusLine(
        [
          goals > 0 ? `${goals} goal${goals === 1 ? "" : "s"}` : "",
          confirmed > 0 ? `${confirmed} confirmed fact${confirmed === 1 ? "" : "s"}` : "",
        ],
        "Summary, goals, and strategy",
      ),
      count: null,
      href: "#case-details",
      tone: "neutral",
      icon: "scales",
    },
    {
      id: "financials",
      label: "Money & property",
      status: "Assets, debts, and income worksheet",
      count: null,
      href: `/dashboard/${caseFile.id}/financials`,
      tone: "neutral",
      icon: "wallet",
    },
    {
      id: "help",
      label: "Talk to a person",
      status: personStatus,
      count: null,
      href: "#help",
      tone: personTone,
      icon: "person",
    },
  ];
}

// ── Action items ─────────────────────────────────────────────────────────────
//
// Every open item, each paired with the way to finish it WITHOUT leaving the
// conversation. That pairing is the point: a status list a client can read but
// not act on just relocates the work. Three affordances cover the real cases —
// open the document, attach the file, or ask the assistant — and anything we
// can't map falls back to asking, which always works because the orchestrator
// can do anything the file needs.

/** How many action items the rail shows before it becomes a list to scroll. */
const ACTION_LIMIT = 6;

function actionForTask(task: MatterTask, drafts: DraftShortcut[]): DeckAction {
  const label = tidy(task.title);
  const base: DeckAction = {
    id: task.id,
    label,
    kind: "chat",
    ask: `${label} — can you help me with this now?`,
    urgency: task.urgency,
    blocked: task.status === "blocked",
  };

  // "Fill in the 3 blanks in your Original Answer" should open that document,
  // not start a conversation about it. Match on the draft's title appearing in
  // the task text — Mission Control phrases these from the document's own name.
  const draft = drafts.find(
    (d) => d.href.includes("draft=") && label.toLowerCase().includes(d.title.toLowerCase()),
  );
  if (draft) {
    const draftId = draft.href.split("draft=")[1];
    if (draftId) {
      return {
        ...base,
        kind: "draft",
        draftId,
        ask: `Help me finish “${draft.title}” — walk me through what's still missing.`,
      };
    }
  }

  // Upload requests are satisfied by attaching a file, which the chat can do.
  if (task.id.startsWith("upload:") || /\bupload\b|\bsend (me|us) (a copy|the)\b/i.test(label)) {
    return { ...base, kind: "upload" };
  }

  return base;
}

function buildActions(tasks: MatterTasksResult, drafts: DraftShortcut[]): DeckAction[] {
  // Doable work first, then what's waiting — a blocked item still gets a row so
  // the client can see it isn't forgotten, and can ask why it's stuck.
  const ordered = [...tasks.doableNow, ...tasks.blocked].slice(0, ACTION_LIMIT);
  const seen = new Set<string>();
  const out: DeckAction[] = [];
  for (const task of ordered) {
    const action = actionForTask(task, drafts);
    // Mission Control's hero duplicates whichever action it promoted, so the
    // same work can arrive twice under different ids.
    const key = action.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

// ── Conversation starters ────────────────────────────────────────────────────
//
// The complaint behind these: "Ask assistant was seen as hidden." A button alone
// doesn't fix that — a client who doesn't know what to say still won't press it.
// These are the specific sentences *this* file makes askable right now, so the
// conversation opens itself.

function buildStarters(input: FileDeckInput, docket: DocketEntry[], drafts: DraftShortcut[]): StarterPrompt[] {
  const out: StarterPrompt[] = [];
  const push = (label: string, text: string) => {
    if (out.length < 3 && !out.some((s) => s.label === label)) out.push({ label, text });
  };

  const pressing = docket[0];
  if (pressing && pressing.urgency !== "normal") {
    push(
      "My deadline",
      `What do I need to do before ${pressing.label.toLowerCase()} on ${pressing.deadlineDate}?`,
    );
  }

  const needy = drafts.find((d) => d.needsInfo);
  if (needy) push("Finish my draft", `Help me finish "${needy.title}" — walk me through what's still missing.`);

  const top = input.tasks.doableNow[0];
  if (top) push("My next step", `${tidy(top.title)} — can you help me with this now?`);

  const blocked = input.tasks.blocked[0];
  if (blocked) push("What's stuck", `Why is "${tidy(blocked.title)}" waiting, and can I do anything to move it?`);

  push("Explain my case", "Explain where my case stands right now in plain English, and what happens next.");
  return out;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Distill a client's whole Living File into the deck the UI renders: one
 * pressing deadline, one next step, her finished work, six destinations, and a
 * few conversation openers. Pure — safe to call on every render.
 */
export function buildFileDeck(input: FileDeckInput): FileDeck {
  const now = input.now ?? new Date();
  const docket = computeDocket(input.facts, now, input.caseFile.jurisdiction);

  const { drafts, more } = buildDrafts(
    input.caseFile.id,
    input.workspaceDrafts ?? [],
    input.documents,
    input.childDocuments ?? [],
  );

  const worst = docket[0] ?? null;
  const pressing: PressingDeadline | null =
    worst && worst.urgency !== "normal"
      ? {
          label: worst.label,
          countdown: countdownText(worst.daysRemaining),
          deadlineDate: worst.deadlineDate,
          urgency: worst.urgency,
          ask:
            worst.daysRemaining < 0
              ? `A deadline on my file (${worst.label}, ${worst.deadlineDate}) has already passed. What are my options now?`
              : `What do I need to do before ${worst.label.toLowerCase()} on ${worst.deadlineDate}?`,
        }
      : null;

  const top = input.tasks.doableNow[0] ?? null;
  const nextStep: NextStep | null = top
    ? {
        title: tidy(top.title),
        detail: top.reason ? tidy(top.reason) : null,
        ask: `${tidy(top.title)} — can you help me with this now?`,
        urgency: top.urgency,
      }
    : null;

  return {
    pressing,
    nextStep,
    actions: buildActions(input.tasks, drafts),
    drafts,
    moreDrafts: more,
    tiles: buildTiles(input, docket),
    starters: buildStarters(input, docket, drafts),
    docketCount: docket.length,
  };
}
