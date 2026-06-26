"use client";

import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
import type { CaseMessage, MessageSenderRole } from "@/lib/types";

interface CaseChatPanelProps {
  caseFileId: string;
  // The role of the person viewing this panel. Their own messages align right;
  // the other party's align left.
  viewerRole: MessageSenderRole;
  // Display name for the other party (e.g. the client's name in attorney view,
  // or "Crawford Law" in client view).
  counterpartLabel: string;
}

const POLL_MS = 5000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return d.toLocaleString("en-US", {
    ...(sameDay ? {} : { month: "short", day: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CaseChatPanel({
  caseFileId,
  viewerRole,
  counterpartLabel,
}: CaseChatPanelProps) {
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/case-files/${caseFileId}/messages`);
      if (res.ok) {
        const data = (await res.json()) as { messages: CaseMessage[] };
        setMessages(data.messages ?? []);
      }
    } catch {
      // transient network error — next poll retries
    } finally {
      setLoaded(true);
    }
  }, [caseFileId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  // Keep the view pinned to the newest message unless the reader has scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/case-files/${caseFileId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        const data = (await res.json()) as { message: CaseMessage };
        setMessages((prev) => [...prev, data.message]);
        setDraft("");
        atBottomRef.current = true;
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not send message");
      }
    } catch {
      setError("Could not send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="case-chat">
      <div className="case-chat-list" ref={listRef} onScroll={onScroll}>
        {!loaded ? (
          <p className="case-chat-empty">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="case-chat-empty">
            No messages yet. Start the conversation below.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === viewerRole;
            return (
              <div
                key={m.id}
                className={`case-chat-msg ${mine ? "case-chat-mine" : "case-chat-theirs"}`}
              >
                <span className="case-chat-role">
                  {mine ? "You" : counterpartLabel}
                  <span className="case-chat-time">{formatTime(m.created_at)}</span>
                </span>
                {m.body}
              </div>
            );
          })
        )}
      </div>
      <form className="case-chat-compose" onSubmit={send}>
        <textarea
          className="case-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          rows={2}
          placeholder="Write a message…"
          disabled={sending}
        />
        <button
          type="submit"
          className="case-chat-send"
          disabled={sending || !draft.trim()}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      {error && <p className="case-chat-error">{error}</p>}
    </div>
  );
}
