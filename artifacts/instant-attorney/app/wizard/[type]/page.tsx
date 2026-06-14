"use client";

import { useState, useRef, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReviewSlaClock from "@/components/ReviewSlaClock";
import { WIZARD_LABELS } from "@/lib/types";
import type { WizardType } from "@/lib/types";
import {
  parseDrafterResponse,
  buildNeededItems,
  buildFallbackTemplate,
  deriveQuestionsFromTemplate,
  ensureChecklistNeeds,
  buildBundledMessage,
} from "@/lib/wizard-parsing";
import type { ParsedDrafter } from "@/lib/wizard-parsing";

// Keep just under the server route's maxDuration (300s) so a long but legitimate
// draft finishes server-side instead of being aborted by the client. If the
// client does give up, the draft is still saved server-side and recovered via the
// /api/documents/lookup path on the next visit.
const WIZARD_TIMEOUT_MS = 290_000; // ~4.8 min — legal docs can be long

interface Message {
  role: "user" | "assistant";
  content: string;
}

function renderDraftWithHighlights(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[\[([^\]]+)\]\]/g, '<mark class="wiz-placeholder">[[<span>$1</span>]]</mark>')
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

export default function WizardPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseFileId = searchParams.get("caseFileId") ?? "";
  const preWarmedDocId = searchParams.get("docId") ?? "";

  const wizardType = type as WizardType;
  const instrumentParam = searchParams.get("instrument") ?? "";
  // For general_document, use the specific instrument name as the display label
  const label = (wizardType === "general_document" && instrumentParam)
    ? instrumentParam
    : (WIZARD_LABELS[wizardType] ?? wizardType);

  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [parsed, setParsed] = useState<ParsedDrafter | null>(null);
  const [documentId, setDocumentId] = useState<string>(preWarmedDocId);
  const [downloading, setDownloading] = useState(false);
  const [submittedForReview, setSubmittedForReview] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Guided checklist: per-field answers + "anything else" note + update feedback
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [extraNote, setExtraNote] = useState("");
  const [justUpdated, setJustUpdated] = useState(false);
  const [truncatedDraft, setTruncatedDraft] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  // A synchronous mirror of the saved document id. State updates are async, so
  // right after a generation finishes the `documentId` state is still stale
  // inside the same handler that needs to auto-send the draft to the attorney —
  // this ref always holds the freshest id.
  const docIdRef = useRef<string>(preWarmedDocId);

  // Elapsed-seconds ticker while streaming
  useEffect(() => {
    if (!streaming) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [streaming]);

  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      initializeDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadExistingDraft(
    doc: {
      id: string;
      draft_text: string;
      status?: string;
      submitted_at?: string | null;
      content_json?: { init_response?: string };
    }
  ) {
    const fakeResponse = `---DRAFT READY---\n${doc.draft_text}\n---END DRAFT---\n\n${doc.content_json?.init_response ?? ""}`;
    const p = parseDrafterResponse(fakeResponse);
    if (!p.draftText) p.draftText = doc.draft_text;
    setParsed(p);
    setMessages([{ role: "assistant", content: fakeResponse }]);
    setDocumentId(doc.id);
    docIdRef.current = doc.id;
    if (doc.status === "pending_review") {
      setSubmittedForReview(true);
      setSubmittedAt(doc.submitted_at ?? null);
    }
  }

  async function initializeDraft() {
    // If we have a pre-warmed doc, load it from the server and show immediately
    if (preWarmedDocId) {
      try {
        const res = await fetch(`/api/documents/${preWarmedDocId}`);
        if (res.ok) {
          const doc = await res.json();
          if (doc.draft_text) {
            loadExistingDraft(doc);
            return;
          }
        }
      } catch {
        // Fall through to lookup / fresh generation
      }
    }

    // Reuse an existing pre-warmed or in-progress draft (avoids duplicate rows)
    if (caseFileId) {
      try {
        const res = await fetch(
          `/api/documents/lookup?caseFileId=${encodeURIComponent(caseFileId)}&docType=${encodeURIComponent(wizardType)}`
        );
        if (res.ok) {
          const doc = await res.json();
          if (doc.draft_text) {
            loadExistingDraft(doc);
            return;
          }
        }
      } catch {
        // Fall through to fresh generation
      }
    }

    // Fresh generation
    await runDrafter([], true);
  }

  async function runDrafter(history: Message[], isInit = false): Promise<boolean> {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const timeoutId = setTimeout(() => abort.abort(), WIZARD_TIMEOUT_MS);

    setStreaming(true);
    setError("");

    const initMsg = instrumentParam
      ? `Please draft a ${instrumentParam} based on my Living File.`
      : `Please draft a ${label} based on my Living File. Document type: ${wizardType}`;
    const outgoingMessages = isInit
      ? [{ role: "user" as const, content: initMsg }]
      : history;

    const aiMsg: Message = { role: "assistant", content: "" };
    setMessages(isInit ? [aiMsg] : [...history, aiMsg]);

    try {
      const res = await fetch("/api/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: outgoingMessages,
          caseFileId,
          wizardType,
          documentId: documentId || undefined,
          instrument: instrumentParam || undefined,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(body?.error || `Server error ${res.status}`);
      }

      const data = await res.json() as { text: string; documentId: string | null; truncated?: boolean };
      const fullText = data.text ?? "";

      if (data.documentId) {
        setDocumentId(data.documentId);
        docIdRef.current = data.documentId;
      }
      if (data.truncated) setTruncatedDraft(true);

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: fullText };
        return next;
      });

      // If Claude returned something but without proper markers, use the whole response as draft
      let p = parseDrafterResponse(fullText);
      if (!p.draftText && fullText.trim()) {
        p = { ...p, draftText: fullText.trim() };
      }
      // Absolute fallback — guarantee a draft AND the questions needed to finish it
      if (!p.draftText) {
        const template = buildFallbackTemplate(label, wizardType);
        const derived = deriveQuestionsFromTemplate(template);
        p = {
          ...p,
          draftText: template,
          missingFacts: {
            blocking: p.missingFacts.blocking.length ? p.missingFacts.blocking : derived.blocking,
            nonBlocking: p.missingFacts.nonBlocking,
          },
          questions: p.questions.length ? p.questions : derived.questions,
        };
      }
      // Guarantee the right pane is never empty when the draft still has gaps:
      // if the model gave a draft with [[placeholders]] but no follow-up
      // questions/missing-facts (e.g. truncated), derive them from the draft.
      p = ensureChecklistNeeds(p);

      // New draft arrived — clear any previously typed answers
      setAnswers({});
      setExtraNote("");
      setParsed(p);
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError(
          "Drafting took too long and was stopped automatically. Legal documents can take up to 2 minutes — please try again and keep this tab open while it works."
        );
      } else {
        setError(err instanceof Error ? err.message : "Connection error");
      }
      return false;
    } finally {
      clearTimeout(timeoutId);
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  // Persist the client's checklist answers as confirmed facts on the file BEFORE
  // any draft generation. These are key facts — they must survive even if the
  // drafter fails, times out, or the tab is closed.
  // Returns true when there was nothing to save OR the save succeeded. Returns
  // false only when a real save was attempted and failed — the caller then stops
  // and tells the client to retry, so answers are never silently discarded.
  async function persistAnswers(items: ReturnType<typeof buildNeededItems>): Promise<boolean> {
    const filled = items
      .filter((it) => answers[it.id]?.trim())
      .map((it) => ({ label: it.label, value: answers[it.id].trim() }));
    const note = extraNote.trim();
    if (!filled.length && !note) return true;
    try {
      const res = await fetch("/api/wizard/save-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFileId, answers: filled, extraNote: note }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Bundle every filled checklist field (plus any free-form note) into a single
  // labeled update so the model knows exactly what each answer is for.
  async function handleSubmitAnswers() {
    if (streaming || submitting || !parsed) return;
    const items = buildNeededItems(parsed);
    const msg = buildBundledMessage(items, answers, extraNote);
    if (!msg) return;

    // Save the answers as facts first, independent of (and before) generation.
    // If this fails we stop here — answers stay in the form so the client can
    // retry — rather than generate and risk losing them.
    const saved = await persistAnswers(items);
    if (!saved) {
      setError("We couldn't save your answers just now — they're still here. Please tap Update again in a moment.");
      return;
    }

    setJustUpdated(false);
    const userMsg: Message = { role: "user", content: msg };
    const ok = await runDrafter([...messages, userMsg], false);
    if (ok) {
      setJustUpdated(true);
      // Bias toward moving the document forward: once the client has answered a
      // round of questions, update the draft AND send it straight to the
      // attorney (placeholders and all). Previously answers only saved a local
      // "draft" the client had to separately submit — so progress looked lost.
      await submitToAttorney();
    }
  }

  async function handleDownload() {
    if (!documentId || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/download`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${label.replace(/\s+/g, "_")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function submitToAttorney() {
    if (submitting) return;
    const id = docIdRef.current || documentId;
    if (!id) {
      setError("Your draft was saved but we couldn't send it just yet. Please click “Send to Attorney” again in a moment.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${id}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setSubmittedForReview(true);
      setSubmittedAt(data.submitted_at ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const currentDraft = parsed?.draftText ?? null;
  const isStreamingDraft = streaming && !currentDraft;
  const neededItems = parsed ? buildNeededItems(parsed) : [];
  const blockingCount = neededItems.filter((it) => it.severity === "blocking").length;
  const filledCount = neededItems.filter((it) => answers[it.id]?.trim()).length;
  const hasAnyInput = filledCount > 0 || extraNote.trim().length > 0;

  return (
    <div className="wiz-shell wiz-shell-v2">
      {/* Header */}
      <header className="wiz-header">
        <button className="wiz-back" onClick={() => router.push("/dashboard")}>← Back to File</button>
        <div className="wiz-title">
          <span className="wiz-type-pill">{label}</span>
          <span className="wiz-acp-badge">ACP Protected</span>
          {parsed?.readyForReview && (
            <span className="wiz-ready-badge">Ready for Review</span>
          )}
        </div>
        <div className="wiz-header-actions">
          {documentId && (
            <button className="wiz-dl-btn" onClick={handleDownload} disabled={downloading}>
              {downloading ? "…" : "Download .docx"}
            </button>
          )}
        </div>
      </header>

      <div className="wiz-body-v2">
        {/* Left: Live Document Draft */}
        <div className="wiz-doc-pane" ref={draftRef}>
          <div className="wiz-doc-header">
            <span className="wiz-doc-label">Draft Document</span>
            {streaming && <span className="wiz-doc-updating">Updating…</span>}
          </div>

          {error && !currentDraft ? (
            <div className="wiz-doc-loading">
              <div className="wiz-gen-error-icon">⚠</div>
              <p className="wiz-gen-error-msg">{error}</p>
              <div className="wiz-gen-error-actions">
                <button className="wiz-retry-btn" onClick={() => { setError(""); runDrafter([], true); }}>
                  Try Again →
                </button>
                <button className="wiz-gen-error-back" onClick={() => router.push("/dashboard")}>
                  ← Back to my file
                </button>
              </div>
              <p className="wiz-gen-error-reassure">
                Nothing is lost — your file and answers are saved. You can come back and try again any time.
              </p>
            </div>
          ) : isStreamingDraft ? (
            <div className="wiz-doc-loading wiz-doc-loading-active">
              <div className="wiz-thinking">
                <span /><span /><span />
              </div>
              <p className="wiz-gen-title">Composing your {label}…</p>
              <p className="wiz-gen-subtitle">Reading your Living File and drafting a complete first version. Legal documents typically take <strong>30–90 seconds</strong> — keep this tab open.</p>
              {elapsed > 0 && (
                <p className="wiz-gen-elapsed">
                  {elapsed < 90
                    ? `${elapsed}s — still working…`
                    : `${elapsed}s — almost there, finalizing the draft…`}
                </p>
              )}
            </div>
          ) : currentDraft ? (
            <div className="wiz-doc-content">
              <div className="wiz-doc-disclaimer">
                This is an AI-generated draft based on your Living File. Answer the questions on the right to fill in the highlighted gaps and move toward a final document.
              </div>
              <div
                className="wiz-doc-text"
                dangerouslySetInnerHTML={{ __html: `<p>${renderDraftWithHighlights(currentDraft)}</p>` }}
              />
            </div>
          ) : (
            <div className="wiz-doc-loading">
              <p>Starting your {label} draft…</p>
            </div>
          )}
        </div>

        {/* Right: Questions & Status */}
        <div className="wiz-qa-pane">
          {submittedForReview ? (
            <div className="wiz-review-submitted">
              <div className="wiz-review-icon">✓</div>
              <h3>Submitted for Attorney Review</h3>
              <p>Andrew Crawford, Esq. will review your draft within 48 hours. You&apos;ll receive an email when it&apos;s ready.</p>
              {submittedAt && <ReviewSlaClock submittedAt={submittedAt} />}
              {documentId && (
                <button className="wiz-dl-btn wiz-dl-btn-full" onClick={handleDownload} disabled={downloading}>
                  {downloading ? "Downloading…" : "Download Current Draft (.docx)"}
                </button>
              )}
              <button className="wiz-back-to-file" onClick={() => router.push("/dashboard")}>
                Return to Your File →
              </button>
            </div>
          ) : (
            <>
              {/* Persistent reassurance — blanks never block your draft */}
              {currentDraft && (
                <div className="wiz-reassure" role="note">
                  <span className="wiz-reassure-icon">✓</span>
                  <div>
                    <strong>It&apos;s okay to leave blanks.</strong> Your draft is ready now. Fill in
                    what you know, then send it — Andrew Crawford, Esq. will fill in anything that&apos;s
                    missing and follow up with you about it.
                  </div>
                </div>
              )}

              {/* Truncation amber notice — soft warning, never blocks the checklist */}
              {truncatedDraft && currentDraft && (
                <div className="wiz-truncation-notice" role="status">
                  <span className="wiz-truncation-icon">⚠</span>
                  <span>
                    The AI draft may have been cut short on a very long document. Review the
                    draft carefully for any abrupt endings, then fill in the fields below and
                    click <strong>Update Draft</strong> — or send to the attorney as-is.
                  </span>
                  <button
                    className="wiz-truncation-dismiss"
                    onClick={() => setTruncatedDraft(false)}
                    aria-label="Dismiss notice"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Guided checklist — one field per piece of info the draft needs */}
              {currentDraft && neededItems.length > 0 && (
                <div className="wiz-checklist">
                  <div className="wiz-checklist-head">
                    <h3 className="wiz-checklist-title">Finish your draft</h3>
                    <p className="wiz-checklist-sub">
                      Fill in what you know — you don&apos;t have to answer everything.
                      When you&apos;re done, click <strong>Update Draft &amp; Send to
                      Attorney</strong>: we&apos;ll update your document and send it
                      straight to Andrew Crawford, Esq. for review. Anything you leave
                      blank stays as a highlighted placeholder for him to finalize.
                    </p>
                    {blockingCount > 0 && (
                      <p className="wiz-checklist-count">
                        <span className="wiz-qa-dot wiz-qa-dot-red" />
                        {blockingCount} item{blockingCount > 1 ? "s" : ""} needed before this can be finalized
                      </p>
                    )}
                  </div>

                  <div className="wiz-field-list">
                    {neededItems.map((it) => (
                      <div
                        key={it.id}
                        className={`wiz-field ${it.severity === "blocking" ? "wiz-field-blocking" : ""}`}
                      >
                        <label className="wiz-field-label" htmlFor={`fld-${it.id}`}>
                          <span
                            className={`wiz-qa-dot ${it.severity === "blocking" ? "wiz-qa-dot-red" : "wiz-qa-dot-amber"}`}
                          />
                          {it.label}
                          {it.severity === "blocking" && <span className="wiz-field-tag">required</span>}
                        </label>
                        {it.hint && <p className="wiz-field-hint">{it.hint}</p>}
                        <input
                          id={`fld-${it.id}`}
                          className="wiz-field-input"
                          type="text"
                          value={answers[it.id] ?? ""}
                          disabled={streaming}
                          placeholder="Type your answer…"
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [it.id]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="wiz-field wiz-field-note">
                    <label className="wiz-field-label" htmlFor="fld-extra">
                      Anything else the attorney should know? (optional)
                    </label>
                    <textarea
                      id="fld-extra"
                      ref={inputRef}
                      className="wiz-input"
                      rows={3}
                      value={extraNote}
                      disabled={streaming}
                      placeholder="Add any extra context, special requests, or clarifications…"
                      onChange={(e) => setExtraNote(e.target.value)}
                    />
                  </div>

                  {justUpdated && (
                    <div className="wiz-updated-confirm">Draft updated ✓</div>
                  )}

                  <button
                    className="wiz-send"
                    onClick={handleSubmitAnswers}
                    disabled={streaming || submitting || !hasAnyInput}
                  >
                    {streaming
                      ? "Updating draft…"
                      : submitting
                        ? "Sending to attorney…"
                        : filledCount > 0
                          ? `Update Draft & Send to Attorney (${filledCount} answer${filledCount > 1 ? "s" : ""}) →`
                          : "Update Draft & Send to Attorney →"}
                  </button>
                </div>
              )}

              {/* No remaining gaps — draft looks complete */}
              {currentDraft && neededItems.length === 0 && (
                <div className="wiz-checklist wiz-checklist-complete">
                  <h3 className="wiz-checklist-title">Your draft looks complete</h3>
                  <p className="wiz-checklist-sub">
                    We didn&apos;t find any remaining blanks. Review the document on the
                    left, then send it to the attorney below.
                  </p>
                  {justUpdated && <div className="wiz-updated-confirm">Draft updated ✓</div>}
                </div>
              )}

              {error && <div className="wiz-error">{error}</div>}

              {/* Send as-is — for clients who have nothing to add and just want the
                  current draft in front of the attorney right now. If they HAVE
                  typed answers, this routes through handleSubmitAnswers first so
                  those answers aren't lost. */}
              {currentDraft && (
                <div className="wiz-submit-area">
                  <div className="wiz-attorney-framing">
                    <p className="wiz-attorney-lead">Nothing to add?</p>
                    <p className="wiz-attorney-body">
                      You can send the current draft to Andrew Crawford, Esq. right
                      now, exactly as it is. He&apos;ll fill in any highlighted blanks
                      and follow up with you about anything he needs.
                    </p>
                  </div>
                  <p className="wiz-submit-hint">
                    {blockingCount > 0
                      ? `${blockingCount} item${blockingCount > 1 ? "s" : ""} still blank — that's okay, the attorney will follow up on what's needed.`
                      : "Sending starts the 48-hour attorney review clock."}
                  </p>
                  <button
                    className="wiz-submit-btn"
                    onClick={hasAnyInput ? handleSubmitAnswers : submitToAttorney}
                    disabled={submitting || streaming || !documentId}
                  >
                    {submitting
                      ? "Sending…"
                      : streaming
                        ? "Working…"
                        : !documentId
                          ? "Preparing draft…"
                          : hasAnyInput
                            ? "Update Draft & Send to Attorney →"
                            : "Send Draft to Attorney As-Is →"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
