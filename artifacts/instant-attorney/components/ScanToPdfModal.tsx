"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  MAX_SCAN_PAGES,
  imagesToPdfFile,
  normalizeRotation,
  sanitizeScanFileName,
  type RotationDeg,
} from "@/lib/scan-to-pdf";

export interface ScanToPdfModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the generated PDF File ready for the existing analyze/store confirm step. */
  onComplete: (file: File) => void;
  /** Optional label context, e.g. a requested document description. */
  contextLabel?: string | null;
}

interface DraftPage {
  id: string;
  file: File;
  previewUrl: string;
  rotation: RotationDeg;
}

function nextId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultFileName(contextLabel?: string | null) {
  if (contextLabel?.trim()) {
    return sanitizeScanFileName(contextLabel.trim()).replace(/\.pdf$/i, "");
  }
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `Phone scan ${stamp}`;
}

export default function ScanToPdfModal({
  open,
  onClose,
  onComplete,
  contextLabel,
}: ScanToPdfModalProps) {
  const titleId = useId();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<DraftPage[]>([]);
  const [fileName, setFileName] = useState(() => defaultFileName(contextLabel));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Reset when opened with new context
  useEffect(() => {
    if (!open) return;
    setFileName(defaultFileName(contextLabel));
    setError("");
    setBusy(false);
  }, [open, contextLabel]);

  // Revoke object URLs on unmount / page removal
  const revokeAll = useCallback((list: DraftPage[]) => {
    for (const p of list) URL.revokeObjectURL(p.previewUrl);
  }, []);

  useEffect(() => {
    if (open) return;
    setPages((prev) => {
      revokeAll(prev);
      return [];
    });
  }, [open, revokeAll]);

  useEffect(() => {
    return () => {
      setPages((prev) => {
        revokeAll(prev);
        return prev;
      });
    };
  }, [revokeAll]);

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError("");
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) {
      setError("Choose photo files (JPEG, PNG, HEIC if your phone supports it).");
      return;
    }
    setPages((prev) => {
      const room = MAX_SCAN_PAGES - prev.length;
      if (room <= 0) {
        setError(`Maximum of ${MAX_SCAN_PAGES} pages per scan.`);
        return prev;
      }
      const slice = incoming.slice(0, room);
      if (incoming.length > room) {
        setError(`Only ${room} more page${room === 1 ? "" : "s"} can be added (${MAX_SCAN_PAGES} max).`);
      }
      const added: DraftPage[] = slice.map((file) => ({
        id: nextId(),
        file,
        previewUrl: URL.createObjectURL(file),
        rotation: 0,
      }));
      return [...prev, ...added];
    });
  }

  function removePage(id: string) {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function rotatePage(id: string) {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, rotation: normalizeRotation(p.rotation + 90) }
          : p
      )
    );
  }

  function movePage(id: string, direction: -1 | 1) {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const next = idx + direction;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  async function handleCreate() {
    if (pages.length === 0) {
      setError("Add at least one photo of the document.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const file = await imagesToPdfFile(
        pages.map((p) => ({ blob: p.file, rotation: p.rotation })),
        fileName,
        { enhance: true }
      );
      onComplete(file);
      onClose();
    } catch (err) {
      console.error("[ScanToPdfModal] convert error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the PDF. Try different photos."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="scan-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="scan-modal">
        <div className="scan-modal-header">
          <div>
            <h2 id={titleId} className="scan-modal-title">
              Scan to PDF
            </h2>
            <p className="scan-modal-sub">
              Take or upload phone photos of each page. We combine them into one PDF on your device — no AI tokens until you choose to analyze.
            </p>
            {contextLabel && (
              <p className="scan-modal-context">For: {contextLabel}</p>
            )}
          </div>
          <button
            type="button"
            className="scan-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close scan"
          >
            ×
          </button>
        </div>

        <div className="scan-modal-name">
          <label htmlFor="scan-pdf-name" className="scan-modal-label">
            PDF name
          </label>
          <input
            id="scan-pdf-name"
            className="scan-modal-input"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            disabled={busy}
            maxLength={80}
          />
        </div>

        <div className="scan-modal-actions">
          <button
            type="button"
            className="scan-modal-btn scan-modal-btn-primary"
            onClick={() => cameraInputRef.current?.click()}
            disabled={busy || pages.length >= MAX_SCAN_PAGES}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Take photo
          </button>
          <button
            type="button"
            className="scan-modal-btn scan-modal-btn-secondary"
            onClick={() => galleryInputRef.current?.click()}
            disabled={busy || pages.length >= MAX_SCAN_PAGES}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Add from gallery
          </button>
        </div>

        {/* capture=environment prefers the rear camera on phones */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="scan-modal-file-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="scan-modal-file-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {pages.length === 0 ? (
          <div className="scan-modal-empty">
            <p>No pages yet.</p>
            <p>Photograph each side of the document in order, then create the PDF.</p>
          </div>
        ) : (
          <ul className="scan-page-list">
            {pages.map((page, index) => (
              <li key={page.id} className="scan-page-item">
                <div className="scan-page-thumb-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.previewUrl}
                    alt={`Page ${index + 1}`}
                    className="scan-page-thumb"
                    style={{ transform: `rotate(${page.rotation}deg)` }}
                  />
                  <span className="scan-page-num">{index + 1}</span>
                </div>
                <div className="scan-page-controls">
                  <button
                    type="button"
                    className="scan-page-ctrl"
                    onClick={() => movePage(page.id, -1)}
                    disabled={busy || index === 0}
                    title="Move earlier"
                    aria-label={`Move page ${index + 1} earlier`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="scan-page-ctrl"
                    onClick={() => movePage(page.id, 1)}
                    disabled={busy || index === pages.length - 1}
                    title="Move later"
                    aria-label={`Move page ${index + 1} later`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="scan-page-ctrl"
                    onClick={() => rotatePage(page.id)}
                    disabled={busy}
                    title="Rotate"
                    aria-label={`Rotate page ${index + 1}`}
                  >
                    ↻
                  </button>
                  <button
                    type="button"
                    className="scan-page-ctrl scan-page-ctrl-danger"
                    onClick={() => removePage(page.id)}
                    disabled={busy}
                    title="Remove"
                    aria-label={`Remove page ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="scan-modal-meta">
          {pages.length} / {MAX_SCAN_PAGES} pages · conversion is free · AI analysis (optional next) uses your usage meter
        </p>

        {error && <p className="scan-modal-error">{error}</p>}

        <div className="scan-modal-footer">
          <button
            type="button"
            className="scan-modal-btn scan-modal-btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="scan-modal-btn scan-modal-btn-primary"
            onClick={handleCreate}
            disabled={busy || pages.length === 0}
          >
            {busy ? "Creating PDF…" : `Create PDF${pages.length ? ` (${pages.length} page${pages.length === 1 ? "" : "s"})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
