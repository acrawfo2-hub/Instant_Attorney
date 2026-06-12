"use client";

import { useState, useRef, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WIZARD_LABELS } from "@/lib/types";
import type { WizardType } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ParsedDrafter {
  draftText: string | null;
  missingFacts: { blocking: string[]; nonBlocking: string[] };
  questions: string[];
  readyForReview: boolean;
}

function parseDrafterResponse(text: string): ParsedDrafter {
  const draftMatch = text.match(/---DRAFT READY---([\s\S]*?)---END DRAFT---/);
  const missingMatch = text.match(/---MISSING FACTS---([\s\S]*?)---END MISSING---/);
  const questionsMatch = text.match(/---FOLLOW-UP---([\s\S]*?)---END FOLLOW-UP---/);
  const fileUpdateMatch = text.match(/---FILE UPDATE---([\s\S]*?)---END FILE UPDATE---/);

  const draftText = draftMatch ? draftMatch[1].trim() : null;

  const blocking: string[] = [];
  const nonBlocking: string[] = [];
  if (missingMatch) {
    const block = missingMatch[1];
    const blockingSection = block.match(/BLOCKING:([\s\S]*?)(?=NON-BLOCKING:|$)/i);
    const nonBlockingSection = block.match(/NON-BLOCKING:([\s\S]*?)$/i);
    if (blockingSection) {
      blocking.push(...blockingSection[1].split("\n").map(l => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean));
    }
    if (nonBlockingSection) {
      nonBlocking.push(...nonBlockingSection[1].split("\n").map(l => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean));
    }
  }

  const questions: string[] = [];
  if (questionsMatch) {
    questions.push(
      ...questionsMatch[1]
        .split("\n")
        .map(l => l.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean)
    );
  }

  const readyForReview = fileUpdateMatch
    ? fileUpdateMatch[1].toUpperCase().includes("READY FOR ATTORNEY REVIEW")
    : false;

  return { draftText, missingFacts: { blocking, nonBlocking }, questions, readyForReview };
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

function DOC_ID_SIGNAL(text: string): string | null {
  const m = text.match(/\x00DOC:([^\x00]+)\x00/);
  return m ? m[1] : null;
}

export default function WizardPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseFileId = searchParams.get("caseFileId") ?? "";
  const preWarmedDocId = searchParams.get("docId") ?? "";

  const wizardType = type as WizardType;
  const label = WIZARD_LABELS[wizardType] ?? wizardType;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [parsed, setParsed] = useState<ParsedDrafter | null>(null);
  const [documentId, setDocumentId] = useState<string>(preWarmedDocId);
  const [downloading, setDownloading] = useState(false);
  const [submittedForReview, setSubmittedForReview] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      initializeDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadExistingDraft(
    doc: { id: string; draft_text: string; content_json?: { init_response?: string } }
  ) {
    const fakeResponse = `---DRAFT READY---\n${doc.draft_text}\n---END DRAFT---\n\n${doc.content_json?.init_response ?? ""}`;
    const p = parseDrafterResponse(fakeResponse);
    if (!p.draftText) p.draftText = doc.draft_text;
    setParsed(p);
    setMessages([{ role: "assistant", content: fakeResponse }]);
    setDocumentId(doc.id);
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

  async function runDrafter(history: Message[], isInit = false) {
    setStreaming(true);
    setError("");

    const initMsg = `Please draft a ${label} based on my Living File. Document type: ${wizardType}`;
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
        }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      if (!res.body) throw new Error("No stream body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);

        // Extract document ID signal if present
        const docId = DOC_ID_SIGNAL(chunk);
        if (docId) setDocumentId(docId);

        const cleanChunk = chunk.replace(/\x00DOC:[^\x00]+\x00/, "");
        fullText += cleanChunk;

        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: fullText };
          return next;
        });
      }

      const p = parseDrafterResponse(fullText);
      setParsed(p);
      if (p.readyForReview) setSubmittedForReview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection error");
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  async function handleAnswer(userText: string) {
    if (streaming || !userText.trim()) return;
    setInput("");

    const userMsg: Message = { role: "user", content: userText };
    const newHistory = [...messages, userMsg];
    await runDrafter(newHistory, false);
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
    if (!documentId) return;
    const res = await fetch(`/api/documents/${documentId}/submit`, {
      method: "POST",
    });
    if (res.ok) setSubmittedForReview(true);
  }

  const currentDraft = parsed?.draftText ?? null;
  const isStreamingDraft = streaming && !currentDraft;

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
              <p style={{ color: "#b91c1c", fontWeight: 500 }}>{error}</p>
              <button
                style={{ marginTop: "1rem", padding: "0.5rem 1.25rem", background: "#1e2d3d", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                onClick={() => { setError(""); runDrafter([], true); }}
              >
                Retry
              </button>
            </div>
          ) : isStreamingDraft ? (
            <div className="wiz-doc-loading">
              <div className="wiz-thinking">
                <span /><span /><span />
              </div>
              <p>Drafting your {label} from your Living File…</p>
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
              {/* Blocking questions */}
              {parsed?.missingFacts.blocking && parsed.missingFacts.blocking.length > 0 && (
                <div className="wiz-qa-section wiz-qa-blocking">
                  <div className="wiz-qa-section-label">
                    <span className="wiz-qa-dot wiz-qa-dot-red" />
                    Blocking — needed to finalize
                  </div>
                  <ul className="wiz-gap-list">
                    {parsed.missingFacts.blocking.map((item, i) => (
                      <li key={i} className="wiz-gap-item wiz-gap-blocking">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Non-blocking */}
              {parsed?.missingFacts.nonBlocking && parsed.missingFacts.nonBlocking.length > 0 && (
                <div className="wiz-qa-section">
                  <div className="wiz-qa-section-label">
                    <span className="wiz-qa-dot wiz-qa-dot-amber" />
                    Non-blocking — can finalize at signing
                  </div>
                  <ul className="wiz-gap-list">
                    {parsed.missingFacts.nonBlocking.map((item, i) => (
                      <li key={i} className="wiz-gap-item">{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Questions */}
              {parsed?.questions && parsed.questions.length > 0 && (
                <div className="wiz-qa-section">
                  <div className="wiz-qa-section-label">Questions</div>
                  <ol className="wiz-question-list">
                    {parsed.questions.map((q, i) => (
                      <li key={i} className="wiz-question-item">{q}</li>
                    ))}
                  </ol>
                </div>
              )}

              {error && <div className="wiz-error">{error}</div>}

              {/* Answer input */}
              {currentDraft && (
                <div className="wiz-answer-area">
                  <textarea
                    ref={inputRef}
                    className="wiz-input"
                    placeholder={
                      parsed?.questions?.[0]
                        ? `Answer: "${parsed.questions[0].replace(/^\(.*?\)\s*/, "").substring(0, 60)}…"`
                        : "Answer a question or provide additional information…"
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={3}
                    disabled={streaming}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAnswer(input);
                      }
                    }}
                  />
                  <button
                    className="wiz-send"
                    onClick={() => handleAnswer(input)}
                    disabled={streaming || !input.trim()}
                  >
                    {streaming ? "Updating draft…" : "Update Draft →"}
                  </button>
                </div>
              )}

              {/* Submit for review */}
              {currentDraft && documentId && !streaming && (
                <div className="wiz-submit-area">
                  <p className="wiz-submit-hint">
                    {parsed?.missingFacts.blocking?.length
                      ? `${parsed.missingFacts.blocking.length} blocking item${parsed.missingFacts.blocking.length > 1 ? "s" : ""} remaining — you can still submit and the attorney will flag them.`
                      : "Draft looks complete. Submit for 48-hour attorney review."}
                  </p>
                  <button
                    className="wiz-submit-btn"
                    onClick={handleSubmitForReview}
                  >
                    Submit for Attorney Review →
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
