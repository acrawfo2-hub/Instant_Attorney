"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Attachment, RequestedAttachment } from "@/lib/types";

interface AttachmentPanelProps {
  caseFileId: string;
}

export default function AttachmentPanel({ caseFileId }: AttachmentPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [requested, setRequested] = useState<RequestedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const analyzeInputRef = useRef<HTMLInputElement>(null);
  const storeInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/attachments?caseFileId=${caseFileId}`);
    if (res.ok) {
      const data = await res.json();
      setAttachments((data.attachments ?? []).filter((a: Attachment) => a.status !== "failed"));
      setRequested(data.requestedAttachments ?? []);
    }
  }, [caseFileId]);

  useEffect(() => { load(); }, [load]);

  // Poll only while something is actively processing
  useEffect(() => {
    const processing = attachments.some((a) => a.status === "processing");
    if (!processing) return;
    const timer = setTimeout(load, 4000);
    return () => clearTimeout(timer);
  }, [attachments, load]);

  async function uploadFile(file: File, analyze: boolean) {
    setUploadError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("caseFileId", caseFileId);
      form.append("analyze", String(analyze));
      const res = await fetch("/api/attachments/upload", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.error ?? "Upload failed");
      } else {
        await load();
      }
    } catch {
      setUploadError("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>, analyze: boolean) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, analyze);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragOver(true); }
  function handleDragLeave() { setDragOver(false); }
  // Drag-and-drop defaults to Analyze — intentional drops are usually substantive docs
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file, true);
  }

  const pendingRequested = requested.filter((r) => r.status === "requested");
  const uploadedRequested = requested.filter((r) => r.status === "uploaded");

  return (
    <div className="att-panel">
      {/* Requested attachments checklist */}
      {requested.length > 0 && (
        <div className="att-checklist">
          <div className="att-checklist-title">Document Checklist</div>
          {pendingRequested.map((r) => (
            <div key={r.id} className="att-checklist-item att-checklist-pending">
              <span className="att-check-box" />
              <div className="att-check-body">
                <span className="att-check-desc">{r.description}</span>
                {r.reason && <span className="att-check-reason">{r.reason}</span>}
              </div>
            </div>
          ))}
          {uploadedRequested.map((r) => (
            <div key={r.id} className="att-checklist-item att-checklist-done">
              <span className="att-check-box att-check-box-done">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <div className="att-check-body">
                <span className="att-check-desc">{r.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Two-tier upload zone */}
      <div
        className={`att-upload-zone${dragOver ? " att-upload-zone-over" : ""}${uploading ? " att-upload-zone-busy" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input ref={analyzeInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.rtf" style={{ display: "none" }} onChange={(e) => handleFileInput(e, true)} />
        <input ref={storeInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.rtf" style={{ display: "none" }} onChange={(e) => handleFileInput(e, false)} />

        {uploading ? (
          <span className="att-uploading-msg">Uploading…</span>
        ) : (
          <>
            <span className="att-drop-hint">{dragOver ? "Drop to analyze →" : "Drag & drop, or choose:"}</span>
            <div className="att-upload-actions">
              <button
                className="att-upload-btn att-upload-btn-analyze"
                onClick={() => analyzeInputRef.current?.click()}
                disabled={uploading}
                title="AI reads the document and enriches your Living File with facts, summaries, and flags"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Analyze with AI
              </button>
              <button
                className="att-upload-btn att-upload-btn-store"
                onClick={() => storeInputRef.current?.click()}
                disabled={uploading}
                title="File is saved for reference but the AI does not read its contents"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Store only
              </button>
            </div>
            <span className="att-upload-hint">PDF, Word, images, text · up to 25 MB</span>
          </>
        )}
      </div>

      {uploadError && <p className="att-upload-error">{uploadError}</p>}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="att-list">
          {attachments.map((att) => {
            const isAnalyzed = !!att.ai_summary;
            const isProcessing = att.status === "processing";
            return (
              <div key={att.id} className={`att-item att-item-${att.status}${!isAnalyzed && !isProcessing ? " att-item-stored" : ""}`}>
                <div className="att-item-icon">
                  {att.attachment_type === "screenshot" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                </div>
                <div className="att-item-body">
                  <span className="att-item-name">{att.file_name}</span>
                  {isProcessing && <span className="att-item-processing-note">AI is reading this document…</span>}
                  {isAnalyzed && <span className="att-item-summary">{att.ai_summary}</span>}
                  {att.urgent_findings && att.urgent_findings !== "None identified" && (
                    <span className="att-item-urgent">{att.urgent_findings}</span>
                  )}
                  {!isAnalyzed && !isProcessing && (
                    <span className="att-item-store-note">Stored only — not analyzed by AI</span>
                  )}
                </div>
                <div className="att-item-right">
                  <span className={`att-status ${isProcessing ? "att-status-processing" : isAnalyzed ? "att-status-ready" : "att-status-stored"}`}>
                    {isProcessing ? "Analyzing…" : isAnalyzed ? "Analyzed" : "Stored"}
                  </span>
                  {att.status === "ready" && (
                    <a href={`/api/attachments/${att.id}`} className="att-view-link" target="_blank" rel="noopener noreferrer">
                      View
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {attachments.length === 0 && !uploading && (
        <p className="att-empty">No documents attached yet. Upload supporting files to enrich your Living File.</p>
      )}
    </div>
  );
}
