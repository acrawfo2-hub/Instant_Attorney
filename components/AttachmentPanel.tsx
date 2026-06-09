"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Attachment, RequestedAttachment } from "@/lib/types";

interface AttachmentPanelProps {
  caseFileId: string;
}

const STATUS_LABELS: Record<string, string> = {
  processing: "Analyzing…",
  ready: "Ready",
  failed: "Failed",
};

export default function AttachmentPanel({ caseFileId }: AttachmentPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [requested, setRequested] = useState<RequestedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/attachments?caseFileId=${caseFileId}`);
    if (res.ok) {
      const data = await res.json();
      setAttachments(data.attachments ?? []);
      setRequested(data.requestedAttachments ?? []);
    }
  }, [caseFileId]);

  useEffect(() => { load(); }, [load]);

  // Poll for processing → ready transitions
  useEffect(() => {
    const processing = attachments.some((a) => a.status === "processing");
    if (!processing) return;
    const timer = setTimeout(load, 4000);
    return () => clearTimeout(timer);
  }, [attachments, load]);

  async function uploadFile(file: File) {
    setUploadError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("caseFileId", caseFileId);
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

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragOver(true); }
  function handleDragLeave() { setDragOver(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
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

      {/* Upload zone */}
      <div
        className={`att-upload-zone${dragOver ? " att-upload-zone-over" : ""}${uploading ? " att-upload-zone-busy" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.rtf"
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>{uploading ? "Uploading…" : dragOver ? "Drop to upload" : "Drag & drop or click to upload"}</span>
        <span className="att-upload-hint">PDF, Word, images, text — up to 25 MB</span>
      </div>

      {uploadError && <p className="att-upload-error">{uploadError}</p>}

      {/* Attachment list */}
      {attachments.length > 0 && (() => {
        const failed = attachments.filter((a) => a.status === "failed");
        const nonFailed = attachments.filter((a) => a.status !== "failed");
        return (
          <div className="att-list">
            {nonFailed.map((att) => (
              <div key={att.id} className={`att-item att-item-${att.status}`}>
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
                  {att.ai_summary && att.status === "ready" && (
                    <span className="att-item-summary">{att.ai_summary}</span>
                  )}
                  {att.urgent_findings && att.urgent_findings !== "None identified" && (
                    <span className="att-item-urgent">{att.urgent_findings}</span>
                  )}
                </div>
                <div className="att-item-right">
                  <span className={`att-status att-status-${att.status}`}>
                    {STATUS_LABELS[att.status] ?? att.status}
                  </span>
                  {att.status === "ready" && (
                    <a href={`/api/attachments/${att.id}`} className="att-view-link" target="_blank" rel="noopener noreferrer">
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
            {failed.length === 1 && (
              <div className="att-item att-item-failed">
                <div className="att-item-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="att-item-body">
                  <span className="att-item-name">{failed[0].file_name}</span>
                </div>
                <div className="att-item-right">
                  <span className="att-status att-status-failed">Failed</span>
                </div>
              </div>
            )}
            {failed.length > 1 && (
              <div className="att-item att-item-failed">
                <div className="att-item-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="att-item-body">
                  <span className="att-item-name">{failed.length} files could not be processed</span>
                  <span className="att-item-summary">{failed.map((f) => f.file_name).join(", ")}</span>
                </div>
                <div className="att-item-right">
                  <span className="att-status att-status-failed">Failed</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {attachments.length === 0 && !uploading && (
        <p className="att-empty">No documents attached yet. Upload supporting files to enrich your Living File.</p>
      )}
    </div>
  );
}
