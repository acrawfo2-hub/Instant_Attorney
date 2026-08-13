"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LivingFileSyncWarning from "@/components/LivingFileSyncWarning";
import type { Attachment, Document, FactItem, ClientWorkspaceDraft } from "@/lib/types";
import { docTypeLabel, isDocumentOutOfDate } from "@/lib/types";
// The attorney working copy is work product until approved — the review editor
// autosaves into it mid-edit. /api/documents/[id]/download enforces the same
// rule; these links are hidden so a client is never offered a 409.
import { isAttorneyApproved } from "@/lib/doc-generator";
import { ATTORNEY_ORIGINATED } from "@/lib/types";

/** A document the attorney started from the file, not one the client submitted. */
const isAttorneyOriginated = (doc: Document) =>
  (doc.content_json as Record<string, unknown> | null)?.source === ATTORNEY_ORIGINATED;
import { findBlanks } from "@/lib/freestyle-drafts";
import DocumentInfoNeeded from "@/components/DocumentInfoNeeded";
import WorkspaceDraftInfoNeeded from "@/components/WorkspaceDraftInfoNeeded";
import DocumentExecutionPanel from "@/components/DocumentExecutionPanel";
import RegenerateDocButton from "@/components/RegenerateDocButton";
import CancelDocButton from "@/components/CancelDocButton";
import ReviewSlaClock from "@/components/ReviewSlaClock";
import ScanToPdfModal from "@/components/ScanToPdfModal";
import type { DraftGenerationJob } from "@/lib/draft-generation-status";

// One concise table for everything on the file: suggested uploads (still needed),
// attachments already added, and the documents drafted with the assistant. Each
// row is a single scannable line; AI summaries, reasons, urgent flags and the
// document's own controls live behind a chevron so the file never overwhelms.
// Replaces the old separate "Documents" card + AttachmentPanel display.

const LARGE_FILE_BYTES = 5 * 1024 * 1024;
const FINALIZED = new Set(["approved", "delivered"]);

// Draft-in-progress poll cadence. Tight while a turn is actually generating so
// the banner clears promptly; slow while idle, because the loop must keep
// running to notice a turn that STARTS after this page mounted (the user can
// kick one off from chat in another tab).
const DRAFT_POLL_ACTIVE_MS = 5000;
const DRAFT_POLL_IDLE_MS = 20000;
const REVISION_POLL_MS = 15000;

// Government form detected in chat, enriched by /api/gov-forms with registry
// detail + completion progress (same shape GovFormInstruments consumed).
interface GovForm {
  id: string;
  status: string;
  source: string;
  lookup_status?: string | null;
  reason: string | null;
  verified: boolean;
  form: { form_number: string; title: string; agency: string; jurisdiction: string; official_url: string; deadline: string; field_count: number };
  progress: { percent: number };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const FileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  </svg>
);
const DraftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);
const ImgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);
const FormIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1z" /><line x1="9" y1="11" x2="15" y2="11" /><line x1="9" y1="15" x2="13" y2="15" />
  </svg>
);
const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" />
  </svg>
);

function Pill({ kind, label }: { kind: string; label: string }) {
  return (
    <span className={`cdt-pill cdt-pill-${kind}`}>
      <span className="cdt-dot" />
      {label}
    </span>
  );
}

// Shared one-line row shell + optional expand panel.
function Row({
  anchorId, expandable, expanded, onToggle, icon, name, meta, flag, pill, date, action, children,
}: {
  /** DOM id so the deck above can link straight at this row (`#doc-<id>`). */
  anchorId?: string;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  name: string;
  meta?: string;
  flag?: string;
  pill: React.ReactNode;
  date: string;
  action: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div id={anchorId} className={`cdt-row lf-anchor${expanded ? " cdt-open" : ""}${expandable ? " cdt-row-exp" : ""}`}>
      <div className="cdt-main" onClick={expandable ? onToggle : undefined} role={expandable ? "button" : undefined}>
        <span className={`cdt-chev${expandable ? "" : " cdt-chev-blank"}`}><Chevron /></span>
        <span className="cdt-ricon">{icon}</span>
        <span className="cdt-rbody">
          <span className="cdt-rname">{name}</span>
          {flag && <span className="cdt-rflag"><AlertIcon />{flag}</span>}
          {meta && <span className="cdt-rmeta">{meta}</span>}
        </span>
        {pill}
        <span className="cdt-rdate">{date}</span>
        <span className="cdt-raction" onClick={(e) => e.stopPropagation()}>{action}</span>
      </div>
      {expandable && expanded && <div className="cdt-detail">{children}</div>}
    </div>
  );
}

export default function CaseDocumentsTable({
  caseFileId,
  documents,
  childDocuments,
  facts,
  isAttorney,
  initialWorkspaceDrafts = [],
}: {
  caseFileId: string;
  documents: Document[];
  childDocuments: Document[];
  facts: FactItem[];
  isAttorney: boolean;
  /** Server-rendered drafts, so the section paints complete on first frame
   *  instead of flashing "nothing yet" until the client fetch lands. The
   *  fetch still runs and takes over — this is the starting value, not a cache. */
  initialWorkspaceDrafts?: ClientWorkspaceDraft[];
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [workspaceDrafts, setWorkspaceDrafts] = useState<ClientWorkspaceDraft[]>(initialWorkspaceDrafts);
  const [forms, setForms] = useState<GovForm[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingRequestedId, setPendingRequestedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanContextLabel, setScanContextLabel] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState("");
  const [draftInProgress, setDraftInProgress] = useState(false);
  const [updatedJustNow, setUpdatedJustNow] = useState(false);
  const [draftJobs, setDraftJobs] = useState<Array<DraftGenerationJob & { label: string; active: boolean }>>([]);
  const draftPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local content overrides for workspace drafts filled inline — avoids a full
  // network reload just to rerender the snippet after blanks are filled.
  const [draftContentOverrides, setDraftContentOverrides] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const [attRes, formRes, draftRes] = await Promise.all([
      fetch(`/api/attachments?caseFileId=${caseFileId}`),
      fetch(`/api/gov-forms?caseFileId=${caseFileId}`),
      fetch(`/api/workspace/drafts?caseFileId=${caseFileId}`),
    ]);
    if (attRes.ok) {
      const data = await attRes.json();
      setAttachments((data.attachments ?? []).filter((a: Attachment) => a.status !== "failed"));
    }
    if (formRes.ok) {
      const data = await formRes.json();
      setForms(data.instruments ?? []);
    }
    if (draftRes.ok) {
      const data = await draftRes.json();
      setWorkspaceDrafts(data.drafts ?? []);
      if (Array.isArray(data.generationJobs)) {
        setDraftJobs(data.generationJobs as Array<DraftGenerationJob & { label: string; active: boolean }>);
      }
    }
  }, [caseFileId]);

  useEffect(() => { load(); }, [load]);

  // The revision endpoint covers every source that can change the Living File,
  // including another tab and background attachment/review workers. Poll only
  // while visible; an immediate visibility poll provides catch-up/reconnect.
  // router.refresh preserves this client component's state, including expanded
  // rows and any uncontrolled/local form edits in its descendants.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRevision: string | null = null;
    let noticeTimer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!cancelled && !document.hidden) timer = setTimeout(check, REVISION_POLL_MS);
    };
    async function check() {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetch(`/api/case-files/revision?caseFileId=${caseFileId}`, { cache: "no-store" });
        if (res.ok) {
          const { revision } = await res.json() as { revision?: string };
          if (revision && lastRevision && revision !== lastRevision) {
            lastRevision = revision;
            await load();
            if (!cancelled) {
              router.refresh();
              setUpdatedJustNow(true);
              if (noticeTimer) clearTimeout(noticeTimer);
              noticeTimer = setTimeout(() => setUpdatedJustNow(false), 8000);
            }
          } else if (revision) {
            lastRevision = revision;
          }
        }
      } catch {
        // The next scheduled request is the recovery path after disconnection.
      } finally {
        schedule();
      }
    }
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        if (timer) clearTimeout(timer);
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (noticeTimer) clearTimeout(noticeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [caseFileId, load, router]);

  useEffect(() => {
    if (!attachments.some((a) => a.status === "processing")) return;
    const timer = setTimeout(load, 4000);
    return () => clearTimeout(timer);
  }, [attachments, load]);

  // Poll the background chat-turn status so we can surface a "draft in progress"
  // indicator while the assistant generates a document and the user is away from
  // chat. The loop NEVER stops on its own: a turn can start at any time from the
  // chat page in another tab, so an idle response reschedules rather than
  // returning (an early version returned, which meant only a turn already
  // running at mount was ever noticed).
  useEffect(() => {
    let cancelled = false;
    // Last observed running state, held in a plain effect-scoped box rather than
    // read off `draftInProgress`. The effect deliberately runs once per
    // caseFileId, so a captured state value would be pinned to its mount-time
    // value (always false) and the running -> finished transition below would
    // never fire.
    const wasRunning = { current: false };
    const observedStates = new Map<string, string>();
    // Set while the tab is backgrounded and we stop looking. On return we can no
    // longer tell whether a turn came and went, so we revalidate once.
    let missedWhileHidden = false;

    const rearm = (ms: number) => {
      if (!cancelled) draftPollRef.current = setTimeout(poll, ms);
    };

    async function poll() {
      // A hidden tab can't show the banner, so skip the request and check again
      // later. `wasRunning` is deliberately left intact across the hidden
      // stretch, so a turn that finishes in the background is still recognised
      // as a completion when the tab comes back.
      if (typeof document !== "undefined" && document.hidden) {
        missedWhileHidden = true;
        rearm(DRAFT_POLL_IDLE_MS);
        return;
      }
      try {
        const res = await fetch(`/api/workspace/drafts/status?caseFileId=${caseFileId}`);
        if (cancelled) return;
        if (!res.ok) {
          rearm(DRAFT_POLL_IDLE_MS);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const jobs = (data.jobs ?? []) as Array<DraftGenerationJob & { label: string; active: boolean }>;
        setDraftJobs(jobs);
        // Refresh on each document's own ready edge. Do this before considering
        // active siblings so an out-of-order completion is never held hostage
        // by the slowest job in the plan.
        const hasNewReady = jobs.some((job) => job.state === "ready" && observedStates.get(job.id) !== "ready");
        for (const job of jobs) observedStates.set(job.id, job.state);
        if (hasNewReady) {
          await load();
          if (!cancelled) router.refresh();
        }
        if (jobs.some((job) => job.active)) {
          wasRunning.current = true;
          // We're watching live again; the completion edge below will catch it.
          missedWhileHidden = false;
          rearm(DRAFT_POLL_ACTIVE_MS);
          return;
        }

        // Refresh on the running -> finished EDGE, or after a blind stretch in
        // the background. Keying off data.done instead would re-fire on every
        // mount while a finished job is still in the registry (15-min TTL, see
        // lib/acp-jobs.ts) and refresh for nothing.
        if (wasRunning.current || missedWhileHidden) {
          wasRunning.current = false;
          missedWhileHidden = false;
          await load();
          // The revision watcher performs the RSC refresh only if persisted file
          // data actually changed. This local fetch clears the progress UI now.
        }
        rearm(DRAFT_POLL_IDLE_MS);
      } catch {
        // Network hiccup — retry quietly.
        rearm(DRAFT_POLL_IDLE_MS);
      }
    }

    // Coming back to the tab: catch up now rather than waiting out the idle
    // interval. `missedWhileHidden` makes that poll revalidate, which covers the
    // case the completion edge alone can't see — a turn that both started AND
    // finished while the tab was hidden, so `wasRunning` never flipped.
    const onVisibilityChange = () => {
      if (cancelled || document.hidden) return;
      if (draftPollRef.current) clearTimeout(draftPollRef.current);
      void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    poll();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (draftPollRef.current) clearTimeout(draftPollRef.current);
    };
    // `load` and `router` are stable for a given caseFileId; re-running this
    // effect on their identity would restart the poll loop and lose wasRunning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseFileId]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function uploadFile(file: File, analyze: boolean) {
    setUploadError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("caseFileId", caseFileId);
      form.append("analyze", String(analyze));
      if (pendingRequestedId) form.append("requestedAttachmentId", pendingRequestedId);
      const res = await fetch("/api/attachments/upload", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.error ?? "Upload failed");
      } else {
        setPendingFile(null);
        setPendingRequestedId(null);
        setAdding(false);
        await load();
      }
    } catch {
      setUploadError("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  }

  function openScan(id: string | null, label: string | null) {
    setUploadError("");
    setPendingRequestedId(id);
    setScanContextLabel(label);
    setScanOpen(true);
  }
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { setUploadError(""); setPendingFile(file); }
    e.target.value = "";
  }
  function openGenericPicker() {
    setUploadError("");
    setPendingRequestedId(null);
    fileInputRef.current?.click();
  }

  // One-click "send to attorney for review" straight from the file. Promotes the
  // workspace draft into the documents pipeline and submits it for review; the row
  // then moves to "Drafts & documents" as In review.
  async function sendDraftForReview(id: string) {
    setPromotingId(id);
    setDraftNotice("");
    try {
      const res = await fetch(`/api/workspace/drafts/${id}/promote`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDraftNotice("✓ Sent to your attorney for review — find it below under Drafts & documents.");
        await load();
        router.refresh();
      } else {
        setDraftNotice(data.error ?? "Could not send for review — please try again.");
      }
    } catch {
      setDraftNotice("Could not send for review — please try again.");
    } finally {
      setPromotingId(null);
    }
  }

  // Assistant-drafted / hand-started drafts still being worked (not yet sent to
  // the attorney — promoted ones show under "Drafts & documents" via `documents`).
  const pendingWorkspaceDrafts = workspaceDrafts.filter((d) => !d.promoted_document_id);
  // Docs pending attorney review get their own prominent band so they're never buried.
  const reviewDocs = documents.filter((d) => d.status === "pending_review");
  const otherDocs = documents.filter((d) => d.status !== "pending_review");
  const total = forms.length + attachments.length + documents.length + pendingWorkspaceDrafts.length;

  return (
    <section className="cdt lf-anchor" id="documents">
      <span id="uploads" className="lf-anchor" aria-hidden="true" />
      <div className="cdt-head">
        <div>
          <h2 className="cdt-title">Documents &amp; attachments</h2>
          <p className="cdt-sub">
            {isAttorney ? "Everything on this client's file" : "Everything on your file"} — what&apos;s needed, what&apos;s in, and what you&apos;ve drafted.
          </p>
          {updatedJustNow && <span className="cdt-updated" role="status">Updated just now</span>}
        </div>
        {!isAttorney && (
          <button type="button" className="cdt-add" onClick={() => { setAdding((v) => !v); setPendingFile(null); setUploadError(""); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add document
          </button>
        )}
      </div>

      {/* Draft-in-progress indicator — appears while a background chat turn is
          generating a document, disappears (and refreshes the list) when done. */}
      {draftJobs.length > 0 && <div className="cdt-draft-jobs" aria-label="Draft generation status">
        {draftJobs.map((job) => <div className={`cdt-draft-progress draft-job-${job.state}`} role="status" aria-live="polite" key={job.id}>
          <span className="cdt-draft-progress-dot" aria-hidden="true" />
          <span className="cdt-draft-progress-text"><strong>{job.title}</strong> — {job.label}
            {job.missing_fact_labels.length > 0 && <> · Needed: {job.missing_fact_labels.join(", ")}</>}
            {job.latest_revision > 0 && <> · Revision {job.latest_revision}</>}
            {job.state === "failed" && <> · {job.failure_message ?? "Generation failed"}</>}
          </span>
        </div>)}
      </div>}

      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.rtf" style={{ display: "none" }} onChange={handleFileInput} />

      {/* Add-document flow (client only) — a compact panel, not a permanent drop zone. */}
      {!isAttorney && (adding || pendingFile || uploading) && (
        <div className="cdt-addpanel">
          {uploading ? (
            <span className="cdt-adding-msg">Uploading{pendingFile ? ` “${pendingFile.name}”` : ""}…</span>
          ) : pendingFile ? (
            <div className="cdt-confirm">
              <div className="cdt-confirm-file">
                <span className="cdt-ricon"><FileIcon /></span>
                <span className="cdt-confirm-name">{pendingFile.name}</span>
                <span className="cdt-confirm-size">{formatSize(pendingFile.size)}</span>
                <button type="button" className="cdt-confirm-x" onClick={() => setPendingFile(null)} aria-label="Choose a different file">×</button>
              </div>
              <p className={`cdt-confirm-note${pendingFile.size >= LARGE_FILE_BYTES ? " cdt-confirm-warn" : ""}`}>
                {pendingFile.size >= LARGE_FILE_BYTES
                  ? "Large file — AI analysis reads the whole document, so cost can be high. Choose “Just store it” if the AI doesn’t need to read it."
                  : "Have the AI read this to enrich your file, or just keep it on file."}
              </p>
              <div className="cdt-confirm-actions">
                <button className="cdt-btn cdt-btn-analyze" onClick={() => uploadFile(pendingFile, true)}>Analyze with AI</button>
                <button className="cdt-btn cdt-btn-store" onClick={() => uploadFile(pendingFile, false)}>Just store it</button>
              </div>
            </div>
          ) : (
            <div
              className={`cdt-drop${dragOver ? " cdt-drop-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); setPendingRequestedId(null); const f = e.dataTransfer.files[0]; if (f) setPendingFile(f); }}
              onClick={openGenericPicker}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGenericPicker(); } }}
            >
              <span className="cdt-drop-hint">{dragOver ? "Drop your file here" : "Drag & drop a file, or click to choose"}</span>
              <button type="button" className="cdt-scan-link" onClick={(e) => { e.stopPropagation(); openScan(null, null); }}>Scan phone photos to PDF</button>
            </div>
          )}
          {uploadError && <p className="cdt-error">{uploadError}</p>}
        </div>
      )}

      <span id="drafted-documents" className="lf-anchor" aria-hidden="true" />
      {documents.filter((d) => d.living_file_sync_status && d.living_file_sync_status !== "synced")
        .map((d) => <LivingFileSyncWarning key={`sync-${d.id}`} documentId={d.id} />)}
      {total === 0 && <span id="attorney-review" className="lf-anchor" aria-hidden="true" />}
      {total === 0 ? (
        <p className="cdt-empty">Nothing on the file yet. Attachments you upload and documents you draft with your assistant will appear here.</p>
      ) : (
        <div className="cdt-table">
          {/* ── WORKING DRAFTS ── drafts created with the assistant in chat (or
              started by hand). They live in the chat side-panel; surfaced here so
              the file is the one place to find them, with a click straight back
              into the conversation to keep editing. */}
          {pendingWorkspaceDrafts.length > 0 && (
            <>
              <div className="cdt-band cdt-band-drafts">
                <span className="cdt-band-label">✏️ Working drafts</span>
                <span className="cdt-band-count cdt-count-drafts">{pendingWorkspaceDrafts.length}</span>
                <span className="cdt-band-hint">drafted with your assistant — read, edit, or send for attorney review</span>
              </div>
              {draftNotice && <div className="cdt-draft-notice">{draftNotice}</div>}
              {pendingWorkspaceDrafts.map((d) => {
                const key = `wsdraft:${d.id}`;
                // Use locally-applied content if the user filled blanks inline;
                // otherwise fall back to what came from the server.
                const content = draftContentOverrides[d.id] ?? d.content;
                const blanks = content ? findBlanks(content) : [];
                const emptyDraft = !content.trim();
                return (
                  <Row
                    key={key}
                    expandable
                    expanded={expanded.has(key)}
                    onToggle={() => toggle(key)}
                    icon={<DraftIcon />}
                    name={d.title}
                    meta={d.source === "assistant" ? "Drafted with your assistant" : "Your draft"}
                    pill={
                      blanks.length > 0
                        ? <Pill kind="draft" label={`Draft · ${blanks.length} blank${blanks.length === 1 ? "" : "s"}`} />
                        : <Pill kind="draft" label="Draft" />
                    }
                    date={fmtDate(d.updated_at)}
                    action={
                      isAttorney ? (
                        <span className="cdt-muted">—</span>
                      ) : (
                        <span className="cdt-draft-actions">
                          <button
                            type="button"
                            className="cdt-review-btn"
                            onClick={() => sendDraftForReview(d.id)}
                            disabled={promotingId === d.id || emptyDraft}
                            title={emptyDraft ? "Add content before sending for review" : "Send this draft to your attorney for review"}
                          >
                            {promotingId === d.id ? "Sending…" : "Send for review"}
                          </button>
                          <Link className="cdt-open-draft" href={`/chat?caseFileId=${caseFileId}&draft=${d.id}`}>
                            Open draft →
                          </Link>
                        </span>
                      )
                    }
                  >
                    {/* Expandable preview: highlighted blanks + inline fill-in form */}
                    <div className="cdt-detail-draft-preview">
                      {content && (
                        <p className="cdt-detail-draft-snippet">
                          {content.split(/(\[\[[^\]]+\]\])/g).slice(0, 20).map((part, i) =>
                            /^\[\[[^\]]+\]\]$/.test(part)
                              ? <mark key={i} className="cdt-draft-blank-mark">{part.slice(2, -2)}</mark>
                              : <span key={i}>{part.slice(0, 300)}</span>
                          )}
                          {content.length > 300 && <span className="cdt-muted"> …</span>}
                        </p>
                      )}
                    </div>
                    {/* Inline blank-fill form — only for clients, only when blanks remain */}
                    {!isAttorney && content && (
                      <WorkspaceDraftInfoNeeded
                        draftId={d.id}
                        draftText={content}
                        draftTitle={d.title}
                        onSaved={(newContent) =>
                          setDraftContentOverrides((prev) => ({ ...prev, [d.id]: newContent }))
                        }
                      />
                    )}
                    <div className="cdt-detail-links">
                      <a href={`/api/workspace/drafts/${d.id}/download`}>Download draft (.docx)</a>
                    </div>
                  </Row>
                );
              })}
            </>
          )}

          {/* ── FORMS TO COMPLETE ── */}
          {forms.length > 0 && (
            <>
              <div className="cdt-band">
                <span className="cdt-band-label">Forms to complete</span>
                <span className="cdt-band-count cdt-count-needed">{forms.length}</span>
                <span className="cdt-band-hint">official forms detected for this matter</span>
              </div>
              {forms.map((inst) => {
                const key = `form:${inst.id}`;
                const completed = inst.status === "completed";
                const looking = inst.source === "dynamic" && inst.lookup_status === "pending";
                const lookupFailed = inst.source === "dynamic" && inst.lookup_status === "failed";
                const guidable = inst.form.field_count > 0;

                const pill = completed ? <Pill kind="approved" label="Completed" />
                  : looking ? <Pill kind="processing" label="Looking up…" />
                  : inst.status === "in_progress" ? <Pill kind="review" label={`In progress · ${inst.progress.percent}%`} />
                  : <Pill kind="needed" label="To complete" />;

                const action = completed ? <span className="cdt-muted">✓ Done</span>
                  : looking ? <span className="cdt-muted">…</span>
                  : guidable ? <Link className="cdt-ghost" href={`/forms/${inst.id}`}>{inst.status === "in_progress" ? "Continue →" : "Start →"}</Link>
                  : inst.form.official_url ? <a className="cdt-ghost" href={inst.form.official_url} target="_blank" rel="noopener noreferrer">Official ↗</a>
                  : <span className="cdt-muted">—</span>;

                return (
                  <Row
                    key={key}
                    expandable
                    expanded={expanded.has(key)}
                    onToggle={() => toggle(key)}
                    icon={<FormIcon />}
                    name={`${inst.form.form_number} — ${inst.form.title}`}
                    meta={inst.form.agency}
                    flag={!inst.verified ? "Confirm at source" : undefined}
                    pill={pill}
                    date="—"
                    action={action}
                  >
                    <div className="cdt-detail-v">{inst.form.agency} · {inst.form.jurisdiction} · deadline {inst.form.deadline}</div>
                    {inst.reason && <><div className="cdt-detail-k">Why it&apos;s needed</div><div className="cdt-detail-v">{inst.reason}</div></>}
                    {!inst.verified && <div className="cdt-detail-v">Auto-detected and not source-verified — confirm the form number and version at the official site.</div>}
                    {lookupFailed && !guidable && <div className="cdt-detail-v">We couldn&apos;t auto-build a guide for this one — use the official link.</div>}
                    {inst.form.official_url && (
                      <div className="cdt-detail-links"><a href={inst.form.official_url} target="_blank" rel="noopener noreferrer">Open official form ↗</a></div>
                    )}
                  </Row>
                );
              })}
            </>
          )}

          {/* ── ON FILE ── */}
          {attachments.length > 0 && (
            <>
              <div className="cdt-band">
                <span className="cdt-band-label">On file</span>
                <span className="cdt-band-count cdt-count-onfile">{attachments.length}</span>
                <span className="cdt-band-hint">uploaded &amp; attached</span>
              </div>
              {attachments.map((att) => {
                const key = `att:${att.id}`;
                const analyzed = !!att.ai_summary;
                const processing = att.status === "processing";
                const urgent = att.urgent_findings && att.urgent_findings !== "None identified" ? att.urgent_findings : null;
                const pill = processing
                  ? <Pill kind="processing" label="Analyzing…" />
                  : analyzed ? <Pill kind="analyzed" label="Analyzed" /> : <Pill kind="stored" label="Stored" />;
                return (
                  <Row
                    key={key}
                    expandable={analyzed || !!urgent}
                    expanded={expanded.has(key)}
                    onToggle={() => toggle(key)}
                    icon={att.attachment_type === "screenshot" ? <ImgIcon /> : <FileIcon />}
                    name={att.file_name}
                    meta={!analyzed && !processing ? "Stored only — not analyzed" : undefined}
                    flag={urgent ? "Time-sensitive" : undefined}
                    pill={pill}
                    date={fmtDate(att.created_at)}
                    action={att.status === "ready" ? <a className="cdt-ghost" href={`/api/attachments/${att.id}`} target="_blank" rel="noopener noreferrer">View</a> : <span className="cdt-muted">…</span>}
                  >
                    {analyzed && <><div className="cdt-detail-k">AI summary</div><div className="cdt-detail-v">{att.ai_summary}</div></>}
                    {urgent && <div className="cdt-detail-urgent">{urgent}</div>}
                  </Row>
                );
              })}
            </>
          )}

          {/* ── WITH YOUR ATTORNEY (pending review) ── */}
          <span id="attorney-review" className="lf-anchor" aria-hidden="true" />
          {reviewDocs.length > 0 && (
            <>
              <div className="cdt-band cdt-band-review">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span className="cdt-band-label">With your attorney</span>
                <span className="cdt-band-count cdt-count-review">{reviewDocs.length}</span>
                <span className="cdt-band-hint">submitted for review · awaiting response within 48 hrs</span>
              </div>
              {reviewDocs.map((doc) => {
                const key = `doc:${doc.id}`;
                const children = childDocuments.filter((c) => c.parent_document_id === doc.id);
                const secondDraft = children.find((c) => c.doc_type === "second_draft");
                const fillTarget = secondDraft?.draft_text ? secondDraft : (doc.draft_text ? doc : null);
                const blanks = fillTarget?.draft_text ? findBlanks(fillTarget.draft_text) : [];
                return (
                  <Row
                    key={key}
                    anchorId={`doc-${doc.id}`}
                    expandable
                    expanded={expanded.has(key)}
                    onToggle={() => toggle(key)}
                    icon={<FileIcon />}
                    name={doc.title}
                    meta={docTypeLabel(doc.doc_type)}
                    pill={<Pill kind="review" label="In review" />}
                    date={fmtDate(doc.created_at)}
                    action={
                      isAttorney
                        ? <Link className="cdt-ghost" href={`/attorney/review/${doc.id}`}>Review →</Link>
                        : doc.draft_text ? <a className="cdt-ghost" href={`/api/documents/${doc.id}/download`}>Download</a>
                        : <span className="cdt-muted">—</span>
                    }
                  >
                    {doc.submitted_at ? (
                      <div className="cdt-detail-status"><ReviewSlaClock submittedAt={doc.submitted_at} compact /></div>
                    ) : null}

                    {blanks.length > 0 && (
                      <div className="cdt-detail-blanks">{blanks.length} blank{blanks.length === 1 ? "" : "s"} still to fill in below.</div>
                    )}

                    <div className="cdt-detail-links">
                      {doc.draft_text && (isAttorney || !isAttorneyOriginated(doc) || isAttorneyApproved(doc.status)) && (
                        <a href={`/api/documents/${doc.id}/download`}>Download {isAttorneyOriginated(doc) ? "draft" : "submitted draft"} (.docx)</a>
                      )}
                      {secondDraft?.draft_text && (isAttorney || isAttorneyApproved(secondDraft.status)) && (
                        <a href={`/api/documents/${secondDraft.id}/download`}>Download revised draft (.docx)</a>
                      )}
                    </div>

                    {/* Fill-in blanks — client, review docs that still have [[blanks]]. */}
                    {!isAttorney && fillTarget?.draft_text && (
                      <DocumentInfoNeeded documentId={fillTarget.id} draftText={fillTarget.draft_text} documentTitle={doc.title} />
                    )}
                  </Row>
                );
              })}
            </>
          )}

          {/* ── DRAFTS & DOCUMENTS ── */}
          {otherDocs.length > 0 && (
            <>
              <div className="cdt-band">
                <span className="cdt-band-label">Drafts &amp; documents</span>
                <span className="cdt-band-count cdt-count-drafts">{otherDocs.length}</span>
                <span className="cdt-band-hint">created with your assistant · kept &amp; searchable</span>
              </div>
              {otherDocs.map((doc) => {
                const key = `doc:${doc.id}`;
                const children = childDocuments.filter((c) => c.parent_document_id === doc.id);
                const secondDraft = children.find((c) => c.doc_type === "second_draft");
                const outOfDate = !isAttorney && !FINALIZED.has(doc.status) && isDocumentOutOfDate(doc, facts);
                const fillTarget = secondDraft?.draft_text ? secondDraft : (doc.draft_text ? doc : null);
                const approvedDownloadId = secondDraft?.draft_text ? secondDraft.id : doc.id;
                const blanks = fillTarget?.draft_text ? findBlanks(fillTarget.draft_text) : [];

                const pill =
                  doc.status === "draft" ? <Pill kind="draft" label="Draft" />
                  : doc.status === "pending_review" ? <Pill kind="review" label="In review" />
                  : doc.status === "approved" ? <Pill kind="approved" label="Approved" />
                  : doc.status === "delivered" ? <Pill kind="approved" label="Delivered" />
                  : doc.status === "changes_requested" ? <Pill kind="review" label="Revisions requested" />
                  : <Pill kind="stored" label={doc.status} />;

                // A promoted document remembers the workspace draft it came
                // from, so "Continue" reopens THAT draft in the panel the client
                // already edits in — rather than a copy, or the retired wizard.
                const originDraftId = workspaceDrafts.find((d) => d.promoted_document_id === doc.id)?.id;
                const continueHref = originDraftId
                  ? `/chat?caseFileId=${doc.case_file_id}&draft=${originDraftId}`
                  : `/chat?caseFileId=${doc.case_file_id}&ask=${encodeURIComponent(`Let's keep working on my ${doc.title}.`)}`;

                const primary =
                  isAttorney ? <Link className="cdt-ghost" href={`/attorney/review/${doc.id}`}>Review →</Link>
                  : doc.status === "draft" ? <Link className="cdt-ghost" href={continueHref}>Continue →</Link>
                  : doc.draft_text ? <a className="cdt-ghost" href={`/api/documents/${doc.id}/download`}>Download</a>
                  : <span className="cdt-muted">—</span>;

                return (
                  <Row
                    key={key}
                    anchorId={`doc-${doc.id}`}
                    expandable
                    expanded={expanded.has(key)}
                    onToggle={() => toggle(key)}
                    icon={doc.status === "draft" ? <DraftIcon /> : <FileIcon />}
                    name={doc.title}
                    meta={docTypeLabel(doc.doc_type)}
                    flag={outOfDate ? "Out of date" : undefined}
                    pill={pill}
                    date={fmtDate(doc.created_at)}
                    action={primary}
                  >
                    {doc.status === "pending_review" && doc.submitted_at ? (
                      <div className="cdt-detail-status"><ReviewSlaClock submittedAt={doc.submitted_at} compact /></div>
                    ) : (DOC_STATUS_HINT[doc.status] || doc.status === "draft") ? (
                      <div className="cdt-detail-v">
                        {doc.status === "draft" ? "Working draft — not yet submitted for attorney review." : DOC_STATUS_HINT[doc.status]}
                      </div>
                    ) : null}

                    {blanks.length > 0 && (
                      <div className="cdt-detail-blanks">{blanks.length} blank{blanks.length === 1 ? "" : "s"} still to fill in below.</div>
                    )}

                    <div className="cdt-detail-links">
                      {doc.draft_text && (
                        <a href={`/api/documents/${doc.id}/download`}>
                          Download {secondDraft?.draft_text ? "original draft" : "document"} (.docx)
                        </a>
                      )}
                      {secondDraft?.draft_text && (isAttorney || isAttorneyApproved(secondDraft.status)) && (
                        <a href={`/api/documents/${secondDraft.id}/download`}>Download revised draft (.docx)</a>
                      )}
                    </div>

                    {outOfDate && <div className="cdt-detail-ctl"><RegenerateDocButton documentId={doc.id} subtle /></div>}

                    {/* Fill-in blanks — client, non-draft docs that still have [[blanks]]. */}
                    {!isAttorney && doc.status !== "draft" && fillTarget?.draft_text && (
                      <DocumentInfoNeeded documentId={fillTarget.id} draftText={fillTarget.draft_text} documentTitle={doc.title} />
                    )}

                    {/* E-sign / execution — client, approved or delivered. */}
                    {!isAttorney && (doc.status === "approved" || doc.status === "delivered") && (
                      <DocumentExecutionPanel documentId={doc.id} documentTitle={doc.title} downloadDocumentId={approvedDownloadId} />
                    )}

                    {doc.status === "changes_requested" && <div className="cdt-detail-ctl"><CancelDocButton documentId={doc.id} /></div>}
                  </Row>
                );
              })}
            </>
          )}
        </div>
      )}

      <ScanToPdfModal open={scanOpen} onClose={() => setScanOpen(false)} onComplete={(file) => { setPendingFile(file); setAdding(true); setScanOpen(false); }} contextLabel={scanContextLabel} />
    </section>
  );
}

const DOC_STATUS_HINT: Record<string, string> = {
  approved: "Approved by your attorney — ready to use.",
  delivered: "Delivered.",
  changes_requested: "Your attorney requested changes.",
};
