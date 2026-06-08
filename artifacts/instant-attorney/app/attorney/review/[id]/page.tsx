"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Attachment } from "@/lib/types";

interface DocumentDetail {
  id: string;
  title: string;
  doc_type: string;
  status: string;
  content_json: Record<string, unknown>;
  draft_text: string | null;
  attorney_notes: string | null;
  created_at: string;
  case_files: {
    id: string;
    matter_type: string | null;
    matter_subtype: string | null;
    summary: string | null;
    goals: string[];
    next_action: string | null;
  };
  profiles: {
    full_name: string | null;
    email: string;
    phone: string | null;
  };
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/documents/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDoc(data);
        setNotes(data.attorney_notes ?? "");
        // Load attachments for this case file
        const caseFileId = data.case_files?.id;
        if (caseFileId) {
          const attRes = await fetch(`/api/attachments?caseFileId=${caseFileId}`);
          if (attRes.ok) {
            const attData = await attRes.json();
            setAttachments(attData.attachments ?? []);
          }
        }
      } else {
        setError("Document not found or access denied");
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleAction(action: "approve" | "request_changes") {
    if (submitting) return;
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/documents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, attorney_notes: notes }),
    });

    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Action failed");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="atty-review-loading">Loading…</div>;
  if (error && !doc) return <div className="atty-review-error">{error}</div>;
  if (!doc) return null;

  if (done) {
    return (
      <div className="atty-review-done">
        <h2>Review submitted</h2>
        <p>The client has been notified.</p>
        <button onClick={() => router.push("/attorney")} className="atty-btn">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="atty-review-shell">
      <header className="atty-review-header">
        <button className="atty-back" onClick={() => router.push("/attorney")}>← Dashboard</button>
        <div className="atty-review-title">
          <h1>{doc.title}</h1>
          <span className="atty-badge atty-badge-amber">{doc.status.replace(/_/g, " ")}</span>
        </div>
      </header>

      <div className="atty-review-body">
        {/* Client & Matter Info */}
        <div className="atty-review-sidebar">
          <div className="atty-review-section">
            <h3>Client</h3>
            <p>{doc.profiles.full_name ?? "—"}</p>
            <p>{doc.profiles.email}</p>
            {doc.profiles.phone && <p>{doc.profiles.phone}</p>}
          </div>

          <div className="atty-review-section">
            <h3>Matter</h3>
            <p>{doc.case_files.matter_type ?? "Unclassified"} {doc.case_files.matter_subtype ? `— ${doc.case_files.matter_subtype}` : ""}</p>
            {doc.case_files.summary && <p className="atty-review-summary">{doc.case_files.summary}</p>}
          </div>

          {doc.case_files.goals?.length > 0 && (
            <div className="atty-review-section">
              <h3>Goals</h3>
              <ul>
                {doc.case_files.goals.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          )}

          {doc.case_files.next_action && (
            <div className="atty-review-section">
              <h3>Next Action</h3>
              <p>{doc.case_files.next_action}</p>
            </div>
          )}

          <div className="atty-review-section">
            <h3>Submitted</h3>
            <p>{new Date(doc.created_at).toLocaleString()}</p>
          </div>

          {attachments.length > 0 && (
            <div className="atty-review-section">
              <h3>Attached Documents</h3>
              {attachments.map((att) => (
                <div key={att.id} className="atty-att-item">
                  <span className="atty-att-name">{att.file_name}</span>
                  {att.ai_summary && <span className="atty-att-summary">{att.ai_summary}</span>}
                  {att.urgent_findings && att.urgent_findings !== "None identified" && (
                    <span className="atty-att-urgent">{att.urgent_findings}</span>
                  )}
                  {att.status === "ready" && (
                    <a
                      href={`/api/attachments/${att.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="atty-att-link"
                    >
                      View / Download
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document Content */}
        <div className="atty-review-content">
          {/* Draft text (primary view for attorney) */}
          {doc.draft_text ? (
            <>
              <div className="atty-review-doc-header">
                <h2>Document Draft</h2>
                <a
                  href={`/api/documents/${id}/download`}
                  download
                  className="atty-btn atty-btn-download"
                >
                  Download .docx
                </a>
              </div>
              <div className="atty-review-draft">
                {doc.draft_text.split("\n\n").map((para, i) => (
                  <p key={i}
                    dangerouslySetInnerHTML={{
                      __html: para
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/\[\[([^\]]+)\]\]/g, '<mark class="atty-placeholder">[[<em>$1</em>]]</mark>')
                        .replace(/\n/g, "<br>"),
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <h2>Document Data</h2>
              <div className="atty-review-data">
                {Object.entries(doc.content_json).filter(([k]) => k !== "init_response").map(([key, val]) => (
                  <div key={key} className="atty-review-field">
                    <dt>{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</dt>
                    <dd>{Array.isArray(val) ? val.join(", ") : String(val ?? "—")}</dd>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Attorney Notes */}
          <div className="atty-review-notes">
            <label htmlFor="notes">Attorney Notes (sent to client if changes requested)</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Add notes for the client or for the file…"
              disabled={submitting}
            />
          </div>

          {error && <div className="atty-review-error-inline">{error}</div>}

          {/* Actions */}
          <div className="atty-review-actions">
            <button
              className="atty-btn atty-btn-approve"
              onClick={() => handleAction("approve")}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Approve & Notify Client"}
            </button>
            <button
              className="atty-btn atty-btn-changes"
              onClick={() => handleAction("request_changes")}
              disabled={submitting}
            >
              Request Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
