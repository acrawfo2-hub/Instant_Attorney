"use client";

import { useState, useRef, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReviewSlaClock from "@/components/ReviewSlaClock";
import { WIZARD_LABELS } from "@/lib/types";
import type { WizardType } from "@/lib/types";
import {
  parseDrafterResponse,
  buildNeededItems,
  deriveQuestionsFromTemplate,
  ensureChecklistNeeds,
  buildBundledMessage,
} from "@/lib/wizard-parsing";
import type { ParsedDrafter } from "@/lib/wizard-parsing";

const WIZARD_TIMEOUT_MS = 150_000; // 2.5 min — legal docs can be long

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

// Guarantee a usable first draft even when the AI call fails or returns nothing.
// The attorney's review pass will improve it regardless of starting quality.
function buildFallbackTemplate(label: string, wizardType: string): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const party = "[[FULL LEGAL NAME — Party A]]";
  const oParty = "[[FULL LEGAL NAME — Party B / Opposing Party]]";
  const jurisdiction = "[[JURISDICTION — State]]";
  const addr = "[[ADDRESS]]";

  if (wizardType === "demand_letter") {
    return `${today}

VIA CERTIFIED MAIL — RETURN RECEIPT REQUESTED

${oParty}
${addr}

Re:    DEMAND FOR ${label.toUpperCase()}

Dear ${oParty}:

This firm represents ${party} in connection with the above-captioned matter. We write to formally demand the following:

1.  BACKGROUND
    [[Describe the facts giving rise to this demand — dates, events, amounts owed, breach, etc.]]

2.  DEMAND
    ${party} hereby demands that you [[specific action required — e.g., pay $X, cease and desist, return property]] within [[NUMBER]] days of the date of this letter.

3.  LEGAL BASIS
    Your conduct constitutes [[legal theory — e.g., breach of contract, tortious interference, conversion]] under ${jurisdiction} law.

4.  CONSEQUENCE OF NON-COMPLIANCE
    If you fail to comply with this demand by [[DEADLINE DATE]], ${party} will pursue all available legal remedies, including but not limited to filing suit in [[COURT]], seeking actual damages, consequential damages, attorneys' fees, and court costs.

This letter is written without prejudice to any other rights or remedies available to ${party}.

Sincerely,

Crawford Law PLLC
${addr}
Texas Bar No. 24148908`;
  }

  if (wizardType === "draft_contract") {
    return `AGREEMENT

This Agreement ("Agreement") is entered into as of ${today}, by and between:

${party} ("Party A"), and
${oParty} ("Party B").

RECITALS

WHEREAS, the parties desire to [[describe the purpose of the agreement]];

NOW, THEREFORE, in consideration of the mutual covenants set forth herein, the parties agree as follows:

1.  SERVICES / OBLIGATIONS
    [[Describe what each party is obligated to do under this agreement.]]

2.  COMPENSATION
    Party B shall pay Party A the sum of $[[AMOUNT]] [[payment schedule — e.g., monthly, upon completion]].

3.  TERM
    This Agreement commences on [[START DATE]] and terminates on [[END DATE]], unless earlier terminated as provided herein.

4.  TERMINATION
    Either party may terminate this Agreement upon [[NUMBER]] days' written notice. [[Describe any termination for cause provisions.]]

5.  GOVERNING LAW
    This Agreement shall be governed by the laws of the State of ${jurisdiction}.

6.  ENTIRE AGREEMENT
    This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

Party A: _______________________________    Date: ____________
${party}

Party B: _______________________________    Date: ____________
${oParty}`;
  }

  if (wizardType === "draft_waiver") {
    return `RELEASE AND WAIVER OF CLAIMS

This Release and Waiver of Claims ("Release") is entered into as of ${today}, by and between:

${party} ("Releasing Party"), and
${oParty} ("Released Party").

1.  RECITALS
    This Release arises from [[describe the underlying matter or dispute]].

2.  RELEASE
    In consideration of [[describe consideration — e.g., payment of $X, settlement of dispute]], the receipt and sufficiency of which are hereby acknowledged, Releasing Party hereby releases and forever discharges Released Party from any and all claims, demands, damages, actions, or causes of action arising from or related to [[the subject matter]].

3.  SCOPE
    This Release covers all claims known and unknown as of the date of execution, including claims under ${jurisdiction} law.

4.  NO ADMISSION
    This Release does not constitute an admission of liability by any party.

5.  GOVERNING LAW
    This Release shall be construed under the laws of the State of ${jurisdiction}.

Releasing Party: _______________________________    Date: ____________
${party}

Released Party: _______________________________    Date: ____________
${oParty}`;
  }

  // Generic fallback for all other types
  return `${label.toUpperCase()}

Date: ${today}
Prepared for: ${party}
Jurisdiction: ${jurisdiction}

---

PRELIMINARY NOTE: This is a working template. Your attorney will refine this draft based on your specific facts. Items marked [[IN BRACKETS]] require information from you.

---

1.  PARTIES

    ${party}
    ${addr}
    ("Client / Principal")

    ${oParty}
    ${addr}
    ("Counterparty")

2.  BACKGROUND AND PURPOSE

    [[Describe the facts and circumstances giving rise to this document. Include relevant dates, prior agreements, events, and the specific legal issue being addressed.]]

3.  MATERIAL TERMS

    [[Set forth the key operative terms — what is being agreed to, transferred, demanded, or resolved.]]

    a.  [[First material term]]
    b.  [[Second material term]]
    c.  [[Additional terms as needed]]

4.  CONSIDERATION

    In consideration of [[describe consideration — money, services, mutual promises]], the receipt and sufficiency of which are acknowledged, the parties agree to the terms set forth herein.

5.  REPRESENTATIONS AND WARRANTIES

    Each party represents and warrants that:
    (a) they have full authority to enter into this arrangement;
    (b) [[additional representations specific to this matter]].

6.  GOVERNING LAW AND DISPUTE RESOLUTION

    This document shall be governed by the laws of the State of ${jurisdiction}. Any dispute arising hereunder shall be resolved by [[mediation / arbitration / litigation]] in [[COUNTY]], ${jurisdiction}.

7.  SIGNATURES

    Executed as of the date first written above.

    ___________________________    Date: ____________
    ${party}

    ___________________________    Date: ____________
    ${oParty}

---
ATTORNEY REVIEW NOTE: This draft was generated from the client's Living File. Attorney should verify: [[list specific items to confirm with client before finalizing]].`;
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

      if (data.documentId) setDocumentId(data.documentId);
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

  // Bundle every filled checklist field (plus any free-form note) into a single
  // labeled update so the model knows exactly what each answer is for.
  async function handleSubmitAnswers() {
    if (streaming || !parsed) return;
    const items = buildNeededItems(parsed);
    const msg = buildBundledMessage(items, answers, extraNote);
    if (!msg) return;

    setJustUpdated(false);
    const userMsg: Message = { role: "user", content: msg };
    const ok = await runDrafter([...messages, userMsg], false);
    if (ok) {
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 6000);
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

  async function handleSubmitForReview() {
    if (!documentId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${documentId}/submit`, { method: "POST" });
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
              <button className="wiz-retry-btn" onClick={() => { setError(""); runDrafter([], true); }}>
                Try Again →
              </button>
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
                      The more you provide, the more complete your document, and the
                      faster the attorney can finalize it. Type your answers, then
                      click <strong>Update Draft</strong> once at the bottom.
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
                    disabled={streaming || !hasAnyInput}
                  >
                    {streaming
                      ? "Updating draft…"
                      : filledCount > 0
                        ? `Update Draft with ${filledCount} Answer${filledCount > 1 ? "s" : ""} →`
                        : "Update Draft →"}
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

              {/* Send to Attorney — always visible once a draft exists */}
              {currentDraft && (
                <div className="wiz-submit-area">
                  <div className="wiz-attorney-framing">
                    <p className="wiz-attorney-lead">Ready when you are</p>
                    <p className="wiz-attorney-body">
                      You can send your draft to the attorney at any time. The more
                      information you add above, the more likely you&apos;ll get back a
                      finished, ready-to-sign document instead of follow-up questions.
                    </p>
                  </div>
                  <p className="wiz-submit-hint">
                    {blockingCount > 0
                      ? `${blockingCount} item${blockingCount > 1 ? "s" : ""} still missing — you can still send now and the attorney will follow up on what's needed.`
                      : "Sending starts the 48-hour attorney review clock."}
                  </p>
                  <button
                    className="wiz-submit-btn"
                    onClick={handleSubmitForReview}
                    disabled={submitting || streaming || !documentId}
                  >
                    {submitting
                      ? "Sending…"
                      : !documentId
                        ? "Preparing draft…"
                        : "Send to Attorney →"}
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
