"use client";

import { useCallback, useEffect, useState } from "react";
import type { InstrumentExecution } from "@/lib/execution";

interface Props {
  documentId: string;
  documentTitle: string;
  /** Preferred download target for the approved .docx (second draft id when present). */
  downloadDocumentId: string;
}

interface StatusPayload {
  execution: InstrumentExecution;
  dropboxSignConfigured: boolean;
  latest: {
    status: string;
    signature_name?: string | null;
    provider?: string | null;
    signed_at?: string | null;
  } | null;
}

export default function DocumentExecutionPanel({
  documentId,
  documentTitle,
  downloadDocumentId,
}: Props) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as StatusPayload;
      setStatus(data);
    } catch {
      // Non-fatal — panel simply stays collapsed until status loads.
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exec = status?.execution;
  const alreadySigned =
    status?.latest?.status === "signed" ||
    status?.latest?.status === "completed";

  async function quickSign() {
    setBusy(true);
    setError(null);
    setDoneMsg(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quick_sign", signatureName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not sign");
        return;
      }
      setDoneMsg(`Signed as ${signatureName}`);
      await load();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function sendDropbox() {
    setBusy(true);
    setError(null);
    setDoneMsg(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dropbox_sign", signerName: signatureName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start Dropbox Sign");
        return;
      }
      setDoneMsg("Signature request sent — check your email to sign.");
      await load();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  if (!exec) {
    return (
      <div className="lf-exec-panel lf-exec-panel-loading">
        Loading signing options…
      </div>
    );
  }

  const isFormalities = exec.mode === "print_formalities";
  const isCourt = exec.mode === "court_signature";
  const canQuickSign = exec.esign_allowed && !isFormalities && !isCourt;

  return (
    <div className={`lf-exec-panel lf-exec-mode-${exec.mode}`}>
      <div className="lf-exec-header">
        <span className="lf-exec-badge">{exec.badge}</span>
        <span className="lf-exec-title">How to finish: {documentTitle}</span>
      </div>

      {alreadySigned && status?.latest && (
        <p className="lf-exec-done">
          Signed
          {status.latest.signature_name ? ` as ${status.latest.signature_name}` : ""}
          {status.latest.signed_at
            ? ` · ${new Date(status.latest.signed_at).toLocaleString()}`
            : ""}
          {status.latest.provider === "dropbox_sign" ? " · via Dropbox Sign" : ""}
        </p>
      )}

      {isFormalities && (
        <div className="lf-exec-body">
          <p className="lf-exec-lead">
            This document needs witnesses and/or a notary — do not e-sign it in the app.
            Print the approved document and the execution packet; the packet labels exactly who signs where.
          </p>
          <ol className="lf-exec-steps">
            {exec.print_steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="lf-exec-roles">
            <div className="lf-exec-roles-label">Signature roles</div>
            <ul>
              {exec.signature_roles.map((role) => (
                <li key={role}>{role}</li>
              ))}
            </ul>
          </div>
          <div className="lf-exec-actions">
            <a
              href={`/api/documents/${downloadDocumentId}/download`}
              className="lf-exec-btn lf-exec-btn-primary"
            >
              Download document (.docx)
            </a>
            <a
              href={`/api/documents/${documentId}/execution-packet`}
              className="lf-exec-btn"
            >
              Download print &amp; sign packet
            </a>
          </div>
        </div>
      )}

      {isCourt && (
        <div className="lf-exec-body">
          <p className="lf-exec-lead">
            This goes to the court or clerk. Sign any verification blocks, then file — the judge or clerk completes the rest.
          </p>
          <ol className="lf-exec-steps">
            {exec.print_steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="lf-exec-roles">
            <div className="lf-exec-roles-label">Who signs</div>
            <ul>
              {exec.signature_roles.map((role) => (
                <li key={role}>{role}</li>
              ))}
            </ul>
          </div>
          <div className="lf-exec-actions">
            <a
              href={`/api/documents/${downloadDocumentId}/download`}
              className="lf-exec-btn lf-exec-btn-primary"
            >
              Download for filing (.docx)
            </a>
            <a
              href={`/api/documents/${documentId}/execution-packet`}
              className="lf-exec-btn"
            >
              Download filing checklist
            </a>
          </div>
        </div>
      )}

      {canQuickSign && !alreadySigned && (
        <div className="lf-exec-body">
          <p className="lf-exec-lead">
            You can sign this electronically now. Type your full legal name to adopt it as your electronic signature.
          </p>
          <ol className="lf-exec-steps">
            {exec.print_steps.slice(0, 3).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="lf-exec-sign-row">
            <label className="lf-exec-sign-label" htmlFor={`sig-${documentId}`}>
              Full legal name
            </label>
            <input
              id={`sig-${documentId}`}
              className="lf-exec-sign-input"
              type="text"
              placeholder="Jane Smith"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="lf-exec-actions">
            <button
              type="button"
              className="lf-exec-btn lf-exec-btn-primary"
              disabled={busy || !signatureName.trim()}
              onClick={() => void quickSign()}
            >
              {busy ? "Signing…" : "Sign electronically"}
            </button>
            <a
              href={`/api/documents/${downloadDocumentId}/download`}
              className="lf-exec-btn"
            >
              Download (.docx)
            </a>
            {status?.dropboxSignConfigured && (
              <button
                type="button"
                className="lf-exec-btn"
                disabled={busy}
                onClick={() => void sendDropbox()}
              >
                Send via Dropbox Sign
              </button>
            )}
          </div>
        </div>
      )}

      {canQuickSign && alreadySigned && (
        <div className="lf-exec-actions">
          <a
            href={`/api/documents/${downloadDocumentId}/download`}
            className="lf-exec-btn lf-exec-btn-primary"
          >
            Download signed copy (.docx)
          </a>
        </div>
      )}

      {error && <p className="lf-exec-error">{error}</p>}
      {doneMsg && <p className="lf-exec-done">{doneMsg}</p>}
    </div>
  );
}
