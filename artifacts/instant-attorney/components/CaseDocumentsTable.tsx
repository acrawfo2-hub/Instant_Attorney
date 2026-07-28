"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import type { Attachment, RequestedAttachment, Document, FactItem } from "@/lib/types";
import { docTypeLabel, isDocumentOutOfDate } from "@/lib/types";
import { findBlanks } from "@/lib/freestyle-drafts";
import DocumentInfoNeeded from "@/components/DocumentInfoNeeded";
import DocumentExecutionPanel from "@/components/DocumentExecutionPanel";
import RegenerateDocButton from "@/components/RegenerateDocButton";
import CancelDocButton from "@/components/CancelDocButton";
import ReviewSlaClock from "@/components/ReviewSlaClock";
import ScanToPdfModal from "@/components/ScanToPdfModal";

// One concise table for everything on the file: suggested uploads (still needed),
// attachments already added, and the documents drafted with the assistant. Each
// row is a single scannable line; AI summaries, reasons, urgent flags and the
// document's own controls live behind a chevron so the file never overwhelms.
// Replaces the old separate "Documents" card + AttachmentPanel display.

const LARGE_FILE_BYTES = 5 * 1024 * 1024;
const FINALIZED = new Set(["approved", "delivered"]);

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
  expandable, expanded, onToggle, icon, name, meta, flag, pill, date, action, children,
}: {
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
    <div className={`cdt-row${expanded ? " cdt-open" : ""}${expandable ? " cdt-row-exp" : ""}`}>
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
}: {
  caseFileId: string;
  documents: Document[];
  childDocuments: Document[];
  facts: FactItem[];
  isAttorney: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [requested, setRequested] = useState<RequestedAttachment[]>([]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [attRes, formRes] = await Promise.all([
      fetch(`/api/attachments?caseFileId=${caseFileId}`),
      fetch(`/api/gov-forms?caseFileId=${caseFileId}`),
    ]);
    if (attRes.ok) {
      const data = await attRes.json();
      setAttachments((data.attachments ?? []).filter((a: Attachment) => a.status !== "failed"));
      setRequested(data.requestedAttachments ?? []);
    }
    if (formRes.ok) {
      const data = await formRes.json();
      setForms(data.instruments ?? []);
    }
  }, [caseFileId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!attachments.some((a) => a.status === "processing")) return;
    const timer = setTimeout(load, 4000);
    return () => clearTimeout(timer);
  }, [attachments, load]);

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

  function startRequestedUpload(id: string) {
    setUploadError("");
    setPendingRequestedId(id);
    fileInputRef.current?.click();
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

  const pendingRequested = requested.filter((r) => r.status === "requested");
  const total = pendingRequested.length + forms.length + attachments.length + documents.length;

  return (
    <section className="cdt">
      <div className="cdt-head">
        <div>
          <h2 className="cdt-title">Documents &amp; attachments</h2>
          <p className="cdt-sub">
            {isAttorney ? "Everything on this client's file" : "Everything on your file"} — what&apos;s needed, what&apos;s in, and what you&apos;ve drafted.
          </p>
        </div>
        {!isAttorney && (
          <button type="button" className="cdt-add" onClick={() => { setAdding((v) => !v); setPendingFile(null); setUploadError(""); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add document
          </button>
        )}
      </div>

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

      {total === 0 ? (
        <p className="cdt-empty">Nothing on the file yet. Attachments you upload and documents you draft with your assistant will appear here.</p>
      ) : (
        <div className="cdt-table">
          {/* ── NEEDS YOUR UPLOAD ── */}
          {pendingRequested.length > 0 && (
            <>
              <div className="cdt-band">
                <span className="cdt-band-label">Needs your upload</span>
                <span className="cdt-band-count cdt-count-needed">{pendingRequested.length}</span>
                <span className="cdt-band-hint">suggested by your assistant</span>
              </div>
              {pendingRequested.map((r) => {
                const key = `req:${r.id}`;
                return (
                  <Row
                    key={key}
                    expandable={!!r.reason}
                    expanded={expanded.has(key)}
                    onToggle={() => toggle(key)}
                    icon={<FileIcon />}
                    name={r.description}
                    pill={<Pill kind="needed" label="Needed" />}
                    date="—"
                    action={
                      <span className="cdt-split">
                        <button type="button" onClick={() => startRequestedUpload(r.id)} disabled={uploading}>Upload</button>
                        <button type="button" onClick={() => openScan(r.id, r.description)} disabled={uploading}>Scan</button>
                      </span>
                    }
                  >
                    <div className="cdt-detail-k">Why it&apos;s needed</div>
                    <div className="cdt-detail-v">{r.reason}</div>
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

          {/* ── DRAFTS & DOCUMENTS ── */}
          {documents.length > 0 && (
            <>
              <div className="cdt-band">
                <span className="cdt-band-label">Drafts &amp; documents</span>
                <span className="cdt-band-count cdt-count-drafts">{documents.length}</span>
                <span className="cdt-band-hint">created with your assistant · kept &amp; searchable</span>
              </div>
              {documents.map((doc) => {
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

                const primary =
                  isAttorney ? <Link className="cdt-ghost" href={`/attorney/review/${doc.id}`}>Review →</Link>
                  : doc.status === "draft" ? <Link className="cdt-ghost" href={`/wizard/${doc.doc_type}?caseFileId=${doc.case_file_id}&docId=${doc.id}`}>Continue →</Link>
                  : doc.draft_text ? <a className="cdt-ghost" href={`/api/documents/${doc.id}/download`}>Download</a>
                  : <span className="cdt-muted">—</span>;

                return (
                  <Row
                    key={key}
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
                      {secondDraft?.draft_text && (
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
