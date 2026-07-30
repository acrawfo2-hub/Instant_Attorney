"use client";

import { useRef, useState } from "react";
import { hasApplicableUpdate } from "@/lib/brainstorm-detect";
import type { CaseBrainstormMessage } from "@/lib/types";

interface Props {
  caseFileId: string;
  initialMessages: CaseBrainstormMessage[];
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CaseBrainstormChat({ caseFileId, initialMessages }: Props) {
  const [messages, setMessages] = useState<CaseBrainstormMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function refreshMessages() {
    const res = await fetch(`/api/attorney/case-files/${caseFileId}/brainstorm`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMessages((data.messages ?? []) as CaseBrainstormMessage[]);
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    setStreamingText("");

    try {
      const res = await fetch(`/api/attorney/case-files/${caseFileId}/brainstorm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to send message");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreamingText(acc);
      }

      await refreshMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setStreamingText(null);
      setSending(false);
    }
  }

  async function applyUpdate(messageId: string) {
    setApplyingId(messageId);
    setError(null);
    try {
      const res = await fetch(`/api/attorney/case-files/${caseFileId}/brainstorm/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to apply update");
      setMessages((prev) => prev.map((m) => (m.id === messageId ? (data.message as CaseBrainstormMessage) : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply update");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="brainstorm-shell">
      <div className="brainstorm-messages" ref={scrollRef}>
        {messages.length === 0 && !streamingText && (
          <div className="atty-empty">
            Nothing here yet — this is a private sounding board for this case. Talk through the matter, and propose a
            Living File or strategy update whenever it&apos;s worth recording.
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`brainstorm-row brainstorm-row-${m.role}`}>
            <div className={`brainstorm-bubble brainstorm-bubble-${m.role}`}>
              <p>{m.content}</p>
              {m.role === "assistant" && hasApplicableUpdate(m.content) && (
                <div className="brainstorm-apply-row">
                  {m.applied_at ? (
                    <span className="brainstorm-applied-badge">Applied {formatTimestamp(m.applied_at)}</span>
                  ) : (
                    <button
                      className="atty-btn atty-btn-primary"
                      // Disabled while ANY apply is in flight, not just this
                      // message's — applying two different messages'
                      // proposed strategy/facts updates concurrently can
                      // race on the same case_files row and silently clobber
                      // one with the other.
                      disabled={applyingId !== null}
                      onClick={() => applyUpdate(m.id)}
                    >
                      {applyingId === m.id ? "Applying…" : "Apply to Living File"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {streamingText !== null && (
          <div className="brainstorm-row brainstorm-row-assistant">
            <div className="brainstorm-bubble brainstorm-bubble-assistant">
              <p>{streamingText || "…"}</p>
            </div>
          </div>
        )}
      </div>

      {error && <div className="lf-session-error">{error}</div>}

      <div className="brainstorm-compose">
        <textarea
          className="atty-second-draft-textarea"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Talk through the case… (Enter to send, Shift+Enter for a new line)"
          disabled={sending}
        />
        <div className="atty-second-draft-actions">
          <button className="atty-btn atty-btn-primary" disabled={sending || !draft.trim()} onClick={send}>
            {sending ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
