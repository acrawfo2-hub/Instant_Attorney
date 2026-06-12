"use client";

import { use, useState, useEffect, useRef } from "react";
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
  review_report: string | null;
  improved_draft_text: string | null;
  review_status: string | null;
  created_at: string;
  case_file_id: string;
  case_files: {
    id: string;
    matter_type: string | null;
    matter_subtype: string | null;
    summary: string | null;
    goals: string[];
    next_action: string | null;
    pre_consult_memo: string | null;
  };
  profiles: {
    full_name: string | null;
    email: string;
    phone: string | null;
  };
}

type AIPanel = "pre_consult" | "review" | "improved_draft";

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

  const [activePanel, setActivePanel] = useState<AIPanel | null>(null);
  const [aiRunning, setAiRunning] = useState<AIPanel | null>(null);
  const [aiError, setAiError] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    const res = await fetch(`/api/documents/${id}`);
    if (res.ok) {
      const data = await res.json();
      setDoc(data);
      setNotes(data.attorney_notes ?? "");
      const caseFileId = data.case_files?.id;
      if (caseFileId) {
        const attRes = await fetch(`/api/attachments?caseFileId=${caseFileId}`);
        if (attRes.ok) {
          const attData = await attRes.json();
          setAttachments(attData.attachments ?? []);
        }
      }
      // If auto-review is in progress, start polling
      if (data.review_status === "reviewing" || data.review_status === "merging") {
        startPolling();
      }
    } else {
      setError("Document not found or access denied");
    }
    setLoading(false);
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/documents/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDoc(data);
        if (data.review_status !== "reviewing" && data.review_status !== "merging") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setAiRunning(null);
        }
      }
    }, 4000);
  }

  async function runAI(panel: AIPanel) {
    if (aiRunning) return;
    setAiRunning(panel);
    setAiError("");
    setActivePanel(panel);

    let endpoint = "";
    let method = "POST";

    if (panel === "pre_consult") {
      endpoint = `/api/attorney/case-files/${doc!.case_files.id}/pre-consult`;
    } else if (panel === "review") {
      endpoint = `/api/attorney/documents/${id}/review`;
    } else if (panel === "improved_draft") {
      endpoint = `/api/attorney/documents/${id}/merge`;
    }

    try {
      const res = await fetch(endpoint, { method });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "Generation failed");
        setAiRunning(null);
        return;
      }

      // Update local doc state with new data
      if (panel === "pre_consult" && data.pre_consult_memo) {
        setDoc((prev) => prev ? {
          ...prev,
          case_files: { ...prev.case_files, pre_consult_memo: data.pre_consult_memo },
        } : prev);
      } else if (panel === "review" && data.review_report) {
        setDoc((prev) => prev ? { ...prev, review_report: data.review_report, review_status: "review_ready" } : prev);
      } else if (panel === "improved_draft" && data.improved_draft_text) {
        setDoc((prev) => prev ? { ...prev, improved_draft_text: data.improved_draft_text, review_status: "merged" } : prev);
      }
    } catch {
      setAiError("Network error — please try again");
    }
    setAiRunning(null);
  }

  async function runFullReview() {
    if (aiRunning) return;
    setAiRunning("review");
    setAiError("");
    setActivePanel("review");
    try {
      const reviewRes = await fetch(`/api/attorney/documents/${id}/review`, { method: "POST" });
      const reviewData = await reviewRes.json();
      if (!reviewRes.ok) { setAiError(reviewData.error ?? "Review failed"); setAiRunning(null); return; }
      setDoc((prev) => prev ? { ...prev, review_report: reviewData.review_report, review_status: "review_ready" } : prev);

      setAiRunning("improved_draft");
      setActivePanel("improved_draft");
      const mergeRes = await fetch(`/api/attorney/documents/${id}/merge`, { method: "POST" });
      const mergeData = await mergeRes.json();
      if (!mergeRes.ok) { setAiError(mergeData.error ?? "Merge failed"); setAiRunning(null); return; }
      setDoc((prev) => prev ? { ...prev, improved_draft_text: mergeData.improved_draft_text, review_status: "merged" } : prev);
    } catch {
      setAiError("Network error — please try again");
    }
    setAiRunning(null);
  }

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

  const hasReview = !!doc.review_report;
  const hasImprovedDraft = !!doc.improved_draft_text;
  const hasPreConsult = !!doc.case_files.pre_consult_memo;
  const isAutoReviewing = doc.review_status === "reviewing" || doc.review_status === "merging";

  function renderDocumentText(text: string) {
    return text.split("\n\n").map((para, i) => (
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
    ));
  }

  function renderPreformatted(text: string) {
    return <pre className="atty-review-preformatted">{text}</pre>;
  }

  return (
    <div className="atty-review-shell">
      <header className="atty-review-header">
        <button className="atty-back" onClick={() => router.push("/attorney")}>← Dashboard</button>
        <div className="atty-review-title">
          <h1>{doc.title}</h1>
          <span className="atty-badge atty-badge-amber">{doc.status.replace(/_/g, " ")}</span>
          {isAutoReviewing && (
            <span className="atty-badge atty-badge-blue atty-badge-pulse">AI reviewing…</span>
          )}
        </div>
      </header>

      <div className="atty-review-body">
        {/* Sidebar */}
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
                  {att.case_relevance && <span className="atty-att-relevance">{att.case_relevance}</span>}
                  {att.urgent_findings && att.urgent_findings !== "None identified" && (
                    <span className="atty-att-urgent">{att.urgent_findings}</span>
                  )}
                  {att.status === "ready" && (
                    <a href={`/api/attachments/${att.id}`} target="_blank" rel="noopener noreferrer" className="atty-att-link">
                      View / Download
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* AI Action Buttons */}
          <div className="atty-review-section atty-ai-actions">
            <h3>AI Tools</h3>
            <button
              className={`atty-ai-btn${hasPreConsult ? " atty-ai-btn-done" : ""}`}
              onClick={() => { setActivePanel("pre_consult"); if (!hasPreConsult) runAI("pre_consult"); }}
              disabled={!!aiRunning}
            >
              {aiRunning === "pre_consult" ? "Generating…" : hasPreConsult ? "Pre-Consult Memo ✓" : "Pre-Consult Review"}
            </button>
            <button
              className={`atty-ai-btn${hasReview ? " atty-ai-btn-done" : ""}`}
              onClick={() => { setActivePanel("review"); if (!hasReview) runAI("review"); }}
              disabled={!!aiRunning || isAutoReviewing}
            >
              {aiRunning === "review" || doc.review_status === "reviewing"
                ? "Reviewing…"
                : hasReview ? "Doc Review ✓" : "Run Doc Review"}
            </button>
            <button
              className={`atty-ai-btn${hasImprovedDraft ? " atty-ai-btn-done" : ""}`}
              onClick={() => { setActivePanel("improved_draft"); if (!hasImprovedDraft && hasReview) runAI("improved_draft"); }}
              disabled={!!aiRunning || !hasReview || doc.review_status === "merging"}
              title={!hasReview ? "Run document review first" : undefined}
            >
              {aiRunning === "improved_draft" || doc.review_status === "merging"
                ? "Merging…"
                : hasImprovedDraft ? "Improved Draft ✓" : "Merge Draft"}
            </button>
            {!hasReview && !hasImprovedDraft && (
              <button
                className="atty-ai-btn atty-ai-btn-full"
                onClick={runFullReview}
                disabled={!!aiRunning || isAutoReviewing}
              >
                {aiRunning ? "Running…" : "Full Review + Merge"}
              </button>
            )}
            {aiError && <p className="atty-ai-error">{aiError}</p>}
          </div>
        </div>

        {/* Main content */}
        <div className="atty-review-content">

          {/* Panel tabs */}
          <div className="atty-panel-tabs">
            <button
              className={`atty-panel-tab${!activePanel || activePanel === null ? " atty-panel-tab-active" : ""}`}
              onClick={() => setActivePanel(null)}
            >
              Original Draft
            </button>
            {hasPreConsult && (
              <button
                className={`atty-panel-tab${activePanel === "pre_consult" ? " atty-panel-tab-active" : ""}`}
                onClick={() => setActivePanel("pre_consult")}
              >
                Pre-Consult Memo
              </button>
            )}
            {(hasReview || doc.review_status === "reviewing") && (
              <button
                className={`atty-panel-tab${activePanel === "review" ? " atty-panel-tab-active" : ""}`}
                onClick={() => setActivePanel("review")}
              >
                Review Report {doc.review_status === "reviewing" ? "⟳" : ""}
              </button>
            )}
            {(hasImprovedDraft || doc.review_status === "merging") && (
              <button
                className={`atty-panel-tab${activePanel === "improved_draft" ? " atty-panel-tab-active" : ""}`}
                onClick={() => setActivePanel("improved_draft")}
              >
                Improved Draft {doc.review_status === "merging" ? "⟳" : ""}
              </button>
            )}
          </div>

          {/* Panel: Original Draft */}
          {(!activePanel) && (
            <>
              {doc.draft_text ? (
                <>
                  <div className="atty-review-doc-header">
                    <h2>Document Draft</h2>
                    <a href={`/api/documents/${id}/download`} download className="atty-btn atty-btn-download">
                      Download .docx
                    </a>
                  </div>
                  <div className="atty-review-draft">
                    {renderDocumentText(doc.draft_text)}
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
            </>
          )}

          {/* Panel: Pre-Consult Memo */}
          {activePanel === "pre_consult" && (
            <div className="atty-ai-panel">
              <h2>Pre-Consult Briefing Memo</h2>
              {aiRunning === "pre_consult" ? (
                <div className="atty-ai-running">Generating briefing memo…</div>
              ) : hasPreConsult ? (
                renderPreformatted(
                  doc.case_files.pre_consult_memo!
                    .replace(/---PRE-CONSULT MEMO---\n?/, "")
                    .replace(/\n?---END MEMO---/, "")
                    .trim()
                )
              ) : (
                <div className="atty-ai-empty">Click "Pre-Consult Review" to generate the briefing memo.</div>
              )}
            </div>
          )}

          {/* Panel: Review Report */}
          {activePanel === "review" && (
            <div className="atty-ai-panel">
              <h2>Document Review Report</h2>
              {(aiRunning === "review" || doc.review_status === "reviewing") ? (
                <div className="atty-ai-running">Running document review…</div>
              ) : hasReview ? (
                renderPreformatted(
                  doc.review_report!
                    .replace(/---DOCUMENT REVIEW---\n?/, "")
                    .replace(/\n?---END REVIEW---/, "")
                    .trim()
                )
              ) : (
                <div className="atty-ai-empty">Click "Run Doc Review" to generate the review report.</div>
              )}
            </div>
          )}

          {/* Panel: Improved Draft */}
          {activePanel === "improved_draft" && (
            <div className="atty-ai-panel">
              <h2>Improved Draft</h2>
              {(aiRunning === "improved_draft" || doc.review_status === "merging") ? (
                <div className="atty-ai-running">Merging review edits into draft…</div>
              ) : hasImprovedDraft ? (
                <>
                  <div className="atty-review-doc-header">
                    <span className="atty-badge atty-badge-green">Post-Review Draft</span>
                  </div>
                  <div className="atty-review-draft">
                    {renderDocumentText(doc.improved_draft_text!)}
                  </div>
                </>
              ) : (
                <div className="atty-ai-empty">Run document review first, then click "Merge Draft".</div>
              )}
            </div>
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

          {/* Final Actions */}
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
