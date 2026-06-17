"use client";

import { use, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Attachment, Document } from "@/lib/types";
import { docTypeLabel, personDisplayName } from "@/lib/types";

interface DocumentDetail {
  id: string;
  title: string;
  doc_type: string;
  status: string;
  content_json: Record<string, unknown>;
  draft_text: string | null;
  attorney_notes: string | null;
  attorney_second_draft_prompt: string | null;
  review_report: string | null;
  review_status: string | null;
  submitted_at: string | null;
  created_at: string;
  case_file_id: string;
  user_id: string;
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
  child_documents?: Document[];
}

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

function stripReviewMarkers(text: string) {
  return text
    .replace(/---DOCUMENT REVIEW---\n?/, "")
    .replace(/\n?---END REVIEW---/, "")
    .trim();
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientNotes, setClientNotes] = useState("");
  const [secondDraftPrompt, setSecondDraftPrompt] = useState("");
  const [promptSaved, setPromptSaved] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [aiRunning, setAiRunning] = useState(false);
  const [generatingSecondDraft, setGeneratingSecondDraft] = useState(false);
  const [aiError, setAiError] = useState("");
  const [secondDraftMessage, setSecondDraftMessage] = useState("");
  const [fitnessWarning, setFitnessWarning] = useState<{
    rationale: string;
    recommendedType: string | null;
  } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    const res = await fetch(`/api/documents/${id}`);
    if (res.ok) {
      const data = await res.json() as DocumentDetail;
      setDoc(data);
      setClientNotes(data.attorney_notes ?? "");
      setSecondDraftPrompt(data.attorney_second_draft_prompt ?? "");
      const caseFileId = data.case_files?.id;
      if (caseFileId) {
        const attRes = await fetch(`/api/attachments?caseFileId=${caseFileId}`);
        if (attRes.ok) {
          const attData = await attRes.json();
          setAttachments(attData.attachments ?? []);
        }
      }
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
        const data = await res.json() as DocumentDetail;
        setDoc(data);
        if (data.review_status !== "reviewing" && data.review_status !== "merging") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setAiRunning(false);
          setGeneratingSecondDraft(false);
        }
      }
    }, 4000);
  }

  async function runManualReview() {
    if (aiRunning) return;
    setAiRunning(true);
    setAiError("");
    try {
      const res = await fetch(`/api/attorney/documents/${id}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "Review failed");
        setAiRunning(false);
        return;
      }
      await load();
    } catch {
      setAiError("Network error — please try again");
    }
    setAiRunning(false);
  }

  async function saveSecondDraftPrompt() {
    setSavingPrompt(true);
    setPromptSaved(false);
    try {
      const res = await fetch(`/api/attorney/documents/${id}/second-draft-prompt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: secondDraftPrompt }),
      });
      if (res.ok) setPromptSaved(true);
    } finally {
      setSavingPrompt(false);
    }
  }

  async function requestSecondDraft() {
    if (generatingSecondDraft || !reviewText) return;
    setGeneratingSecondDraft(true);
    setSecondDraftMessage("");
    setFitnessWarning(null);
    setAiError("");

    try {
      await saveSecondDraftPrompt();
      const res = await fetch(`/api/attorney/documents/${id}/second-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: secondDraftPrompt }),
      });
      const data = await res.json();

      if (res.status === 422 && data.fitness) {
        setFitnessWarning({
          rationale: data.fitness.rationale,
          recommendedType: data.fitness.recommendedType ?? data.fitness.recommended_type ?? null,
        });
        setSecondDraftMessage(data.error ?? "Document type may not be appropriate for this matter.");
        setGeneratingSecondDraft(false);
        return;
      }

      if (!res.ok) {
        setSecondDraftMessage(data.error ?? "Second draft generation failed.");
        setGeneratingSecondDraft(false);
        return;
      }

      setSecondDraftMessage("Second draft generated successfully.");
      await load();
    } catch {
      setSecondDraftMessage("Network error — please try again.");
    }
    setGeneratingSecondDraft(false);
  }

  async function handleAction(action: "approve" | "request_changes") {
    if (submitting) return;
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/documents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, attorney_notes: clientNotes }),
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
        <p>Your decision has been recorded.</p>
        <button onClick={() => router.push("/attorney")} className="atty-btn">Back to Dashboard</button>
      </div>
    );
  }

  const children = doc.child_documents ?? [];
  const criticalReview = children.find((c) => c.doc_type === "critical_review");
  const secondDraft = children.find((c) => c.doc_type === "second_draft");
  const reviewText = criticalReview?.draft_text ?? doc.review_report;
  const isReviewing = doc.review_status === "reviewing" || (aiRunning && !generatingSecondDraft);
  const isMerging = doc.review_status === "merging" || generatingSecondDraft;

  return (
    <div className="atty-review-shell">
      <header className="atty-review-header">
        <button className="atty-back" onClick={() => router.push("/attorney")}>← Dashboard</button>
        <div className="atty-review-title">
          <h1>{doc.title}</h1>
          <span className="atty-badge atty-badge-amber">{doc.status.replace(/_/g, " ")}</span>
          {isReviewing && (
            <span className="atty-badge atty-badge-blue atty-badge-pulse">Generating review memo…</span>
          )}
          {isMerging && (
            <span className="atty-badge atty-badge-blue atty-badge-pulse">Generating 2nd draft…</span>
          )}
        </div>
      </header>

      <div className="atty-review-body">
        <div className="atty-review-sidebar">
          <div className="atty-review-section">
            <h3>Client</h3>
            <p>{personDisplayName(doc.profiles, "—")}</p>
            <p>{doc.profiles.email}</p>
            {doc.profiles.phone && <p>{doc.profiles.phone}</p>}
          </div>

          <div className="atty-review-section">
            <h3>Matter</h3>
            <p>{doc.case_files.matter_type ?? "Unclassified"} {doc.case_files.matter_subtype ? `— ${doc.case_files.matter_subtype}` : ""}</p>
            {doc.case_files.summary && <p className="atty-review-summary">{doc.case_files.summary}</p>}
          </div>

          <div className="atty-review-section">
            <h3>Living File</h3>
            <Link href={`/attorney/client/${doc.user_id}`} className="atty-living-file-link">
              View full client file →
            </Link>
          </div>

          <div className="atty-review-section">
            <h3>Submitted</h3>
            <p>{doc.submitted_at ? new Date(doc.submitted_at).toLocaleString() : new Date(doc.created_at).toLocaleString()}</p>
          </div>

          {attachments.length > 0 && (
            <div className="atty-review-section">
              <h3>Attachments</h3>
              {attachments.map((att) => (
                <div key={att.id} className="atty-att-item">
                  <span className="atty-att-name">{att.file_name}</span>
                  {att.status === "ready" && (
                    <a href={`/api/attachments/${att.id}`} target="_blank" rel="noopener noreferrer" className="atty-att-link">
                      View / Download
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="atty-review-section atty-ai-actions">
            <h3>Critical Review</h3>
            <button
              className={`atty-ai-btn${reviewText ? " atty-ai-btn-done" : ""}`}
              onClick={runManualReview}
              disabled={aiRunning}
            >
              {aiRunning ? "Generating…" : reviewText ? "Re-run Critical Review" : "Run Critical Review"}
            </button>
            {aiError && <p className="atty-ai-error">{aiError}</p>}
          </div>
        </div>

        <div className="atty-review-content">
          <div className="atty-two-doc-grid">
            <section className="atty-standalone-doc">
              <div className="atty-standalone-doc-header">
                <div>
                  <h2>Document 1 — Client Draft</h2>
                  <p className="atty-standalone-doc-sub">{docTypeLabel(doc.doc_type)} · original wizard output</p>
                </div>
                {doc.draft_text && (
                  <div className="atty-doc-downloads">
                    <a href={`/api/documents/${id}/download`} download className="atty-btn atty-btn-download">
                      Download .docx
                    </a>
                    <a href={`/api/documents/${id}/needed-info`} download className="atty-btn atty-btn-download">
                      Info needed
                    </a>
                  </div>
                )}
              </div>
              {Boolean(doc.content_json?.truncated) && (
                <div className="doc-truncation-notice" role="status">
                  <span className="doc-truncation-icon">⚠</span>
                  <span>
                    This draft was generated from a very long document and may have been cut
                    short. Review the full text for any abrupt endings before finalizing.
                  </span>
                </div>
              )}
              {doc.draft_text ? (
                <div className="atty-review-draft">{renderDocumentText(doc.draft_text)}</div>
              ) : (
                <p className="atty-ai-empty">No draft text available.</p>
              )}
            </section>

            <section className="atty-standalone-doc">
              <div className="atty-standalone-doc-header">
                <div>
                  <h2>Document 2 — Critical Review Memo</h2>
                  <p className="atty-standalone-doc-sub">AI analysis · standalone review document</p>
                </div>
                {criticalReview?.id && reviewText && (
                  <a href={`/api/documents/${criticalReview.id}/download`} download className="atty-btn atty-btn-download">
                    Download .docx
                  </a>
                )}
              </div>
              {isReviewing ? (
                <div className="atty-ai-running">Generating critical review memo…</div>
              ) : reviewText ? (
                <pre className="atty-review-preformatted">{stripReviewMarkers(reviewText)}</pre>
              ) : (
                <p className="atty-ai-empty">
                  No review memo yet. Click Run Critical Review in the sidebar to generate one.
                </p>
              )}
            </section>
          </div>

          {isMerging && !secondDraft?.draft_text && (
            <section className="atty-standalone-doc atty-second-draft-preview">
              <div className="atty-ai-running">
                Checking document type fit, then generating revised draft… This may take a minute.
              </div>
            </section>
          )}

          {secondDraft?.draft_text && (
            <section className="atty-standalone-doc atty-second-draft-preview">
              <div className="atty-standalone-doc-header">
                <div>
                  <h2>Document 3 — Revised Draft</h2>
                  <p className="atty-standalone-doc-sub">Generated second draft (approve this version to send to client)</p>
                </div>
                <div className="atty-doc-downloads">
                  <a href={`/api/documents/${secondDraft.id}/download`} download className="atty-btn atty-btn-download">
                    Download .docx
                  </a>
                  <a href={`/api/documents/${secondDraft.id}/needed-info`} download className="atty-btn atty-btn-download">
                    Info needed
                  </a>
                </div>
              </div>
              {(() => {
                const changes = (secondDraft.content_json as Record<string, unknown> | null)?.changes;
                return typeof changes === "string" && changes.trim() ? (
                  <details className="atty-changes-panel" open>
                    <summary>Key changes from first draft (attorney only — not shown to client)</summary>
                    <pre className="atty-review-preformatted">{changes.trim()}</pre>
                  </details>
                ) : null;
              })()}
              <div className="atty-review-draft">{renderDocumentText(secondDraft.draft_text)}</div>
            </section>
          )}

          <div className="atty-second-draft-workspace">
            <h2>Second Draft Instructions</h2>
            <p className="atty-second-draft-hint">
              Private attorney input only — never shown to the client. Combined with the initial draft, critical review memo, and Living File to generate a refined second draft.
            </p>
            <textarea
              className="atty-second-draft-textarea"
              value={secondDraftPrompt}
              onChange={(e) => { setSecondDraftPrompt(e.target.value); setPromptSaved(false); }}
              rows={6}
              placeholder="Add directives for the revised draft: tone changes, clauses to add/remove, facts to emphasize, risks to address…"
            />
            <div className="atty-second-draft-actions">
              <button className="atty-btn" onClick={saveSecondDraftPrompt} disabled={savingPrompt}>
                {savingPrompt ? "Saving…" : promptSaved ? "Saved ✓" : "Save Instructions"}
              </button>
              <button
                className="atty-btn atty-btn-primary"
                onClick={requestSecondDraft}
                disabled={generatingSecondDraft || !reviewText || !doc.draft_text}
                title={!reviewText ? "Run critical review first" : undefined}
              >
                {generatingSecondDraft ? "Generating 2nd Draft…" : "Generate 2nd Draft"}
              </button>
            </div>
            {fitnessWarning && (
              <div className="atty-fitness-warning">
                <strong>Document type check did not pass.</strong>
                <p>{fitnessWarning.rationale}</p>
                {fitnessWarning.recommendedType && (
                  <p>Suggested instrument: <em>{fitnessWarning.recommendedType}</em></p>
                )}
              </div>
            )}
            {secondDraftMessage && <p className="atty-second-draft-message">{secondDraftMessage}</p>}
          </div>

          <div className="atty-review-notes">
            <label htmlFor="client-notes">Notes to client (only sent if you request changes)</label>
            <textarea
              id="client-notes"
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              rows={4}
              placeholder="Explain what the client should revise…"
              disabled={submitting}
            />
          </div>

          {error && <div className="atty-review-error-inline">{error}</div>}

          <div className="atty-review-actions">
            <button
              className="atty-btn atty-btn-approve"
              onClick={() => handleAction("approve")}
              disabled={submitting}
            >
              {submitting
                ? "Submitting…"
                : secondDraft?.draft_text
                  ? "Approve Revised Draft & Notify Client"
                  : "Approve Draft & Notify Client"}
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
