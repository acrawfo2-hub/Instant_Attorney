"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CaseFile } from "@/lib/types";

interface QuickConsultModalProps {
  caseFileId: string;
  onClose: () => void;
}

export default function QuickConsultModal({ caseFileId, onClose }: QuickConsultModalProps) {
  const router = useRouter();
  const [activeFiles, setActiveFiles] = useState<CaseFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"main" | "link">("main");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/case-files")
      .then((r) => r.json())
      .then((d) => setActiveFiles((d.files ?? []).filter((f: CaseFile) => f.file_type === "standard" && f.status === "open")))
      .catch(() => {});
  }, []);

  async function handleSaveAsNew() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/case-files/${caseFileId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveAsNew: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      router.push(`/dashboard/${data.caseFileId}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkToFile(targetId: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/case-files/${caseFileId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCaseFileId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      router.push(`/dashboard/${data.caseFileId}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleLetExpire() {
    router.push("/dashboard");
  }

  return (
    <div className="qc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qc-modal-box">
        <div className="qc-modal-header">
          <div className="qc-modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h3 className="qc-modal-title">Save this Quick Question?</h3>
            <p className="qc-modal-sub">Unless you save it, this conversation leaves your dashboard in 7 days and moves to secure long-term storage. We retain it and you can request a copy later.</p>
          </div>
        </div>

        {step === "main" && (
          <div className="qc-modal-options">
            <button className="qc-modal-opt qc-modal-opt-primary" onClick={handleSaveAsNew} disabled={loading}>
              <div className="qc-modal-opt-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <div>
                <div className="qc-modal-opt-label">Save as New File</div>
                <div className="qc-modal-opt-desc">Turn this consult into a full Living File</div>
              </div>
            </button>

            <button
              className="qc-modal-opt"
              onClick={() => setStep("link")}
              disabled={loading || activeFiles.length === 0}
            >
              <div className="qc-modal-opt-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <div>
                <div className="qc-modal-opt-label">Link to Existing File</div>
                <div className="qc-modal-opt-desc">
                  {activeFiles.length === 0 ? "No active files to link to" : "Merge this consult into one of your open files"}
                </div>
              </div>
            </button>

            <button className="qc-modal-expire" onClick={handleLetExpire} disabled={loading}>
              Let it expire — archives in 7 days
            </button>
          </div>
        )}

        {step === "link" && (
          <div className="qc-modal-link-step">
            <button className="qc-modal-back" onClick={() => setStep("main")}>← Back</button>
            <p className="qc-modal-link-label">Choose a file to merge this consult into:</p>
            <div className="qc-modal-file-list">
              {activeFiles.map((f) => (
                <button
                  key={f.id}
                  className="qc-modal-file-item"
                  onClick={() => handleLinkToFile(f.id)}
                  disabled={loading}
                >
                  <div className="qc-modal-file-title">
                    {f.title || f.matter_subtype?.replace(/_/g, " ") || "Intake in progress"}
                  </div>
                  <div className="qc-modal-file-date">
                    {new Date(f.opened_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="qc-modal-error">{error}</p>}
      </div>
    </div>
  );
}
