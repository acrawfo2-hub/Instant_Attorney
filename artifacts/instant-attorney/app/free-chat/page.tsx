"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getPracticeArea } from "@/lib/practice-areas";

type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
}

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hello — I'm glad you reached out.\n\nI'm the Instant Attorney assistant, part of Crawford Law PLLC. I'm here to help you understand your legal situation in plain English — free, with no account needed. Just so you know upfront: what we discuss here is general legal information, not legal advice, and this conversation isn't protected by attorney-client privilege.\n\nTell me what's going on. You don't need to have it all figured out — just start wherever feels natural.",
};

function renderContent(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("---")) {
      elements.push(<hr key={i} className="fc-divider" />);
    } else if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      elements.push(
        <p key={i} className="fc-msg-heading">
          {line.slice(2, -2)}
        </p>
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="fc-msg-list">
          {items.map((item, j) => (
            <li key={j}>{inlineBold(item)}</li>
          ))}
        </ul>
      );
      continue;
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="fc-spacer" />);
    } else {
      elements.push(<p key={i}>{inlineBold(line)}</p>);
    }
    i++;
  }

  return elements;
}

function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function FreeChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [chatTruncated, setChatTruncated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const exchangeCount = messages.filter((m) => m.role === "user").length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Tailor the opening message to the practice area the user arrived from
  // (/free-chat?area=hoa, etc.). Read after mount so server and first client
  // render match (no hydration mismatch), and only swap the untouched greeting.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("area");
    const area = getPracticeArea(slug);
    if (!area) return;
    setMessages((prev) =>
      prev.length === 1 && prev[0].role === "assistant"
        ? [{ role: "assistant", content: area.opener }]
        : prev
    );
    if (area.starterPrompt) setInput(area.starterPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setStreamingText("");

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setStreamingText(full);
      }

      // Detect structured truncation sentinel emitted by the server
      const TRUNC_SENTINEL = "\x01TRUNCATED\x01";
      if (full.endsWith(TRUNC_SENTINEL)) {
        full = full.slice(0, -TRUNC_SENTINEL.length);
        setChatTruncated(true);
      } else {
        setChatTruncated(false);
      }
      setMessages((prev) => [...prev, { role: "assistant", content: full }]);
      setStreamingText("");
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I'm sorry — something went wrong on my end. Please try sending your message again.",
        },
      ]);
      setStreamingText("");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as unknown as FormEvent);
    }
  }

  return (
    <div className="fc-shell">
      {/* TOP BAR */}
      <header className="fc-topbar">
        <button className="fc-topbar-logo" onClick={() => router.push("/")}>
          <div className="fc-logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span>Instant-Attorney</span>
        </button>

        <div className="fc-topbar-center">
          <span className="fc-phase-label">Phase I · Free Guidance</span>
        </div>

        <div className="fc-topbar-right">
          <button
            className="fc-upgrade-btn"
            onClick={() => router.push("/register?upgrade=phase2")}
          >
            Upgrade to Phase II
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </header>

      {/* DISCLAIMER */}
      <div className="fc-disclaimer">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        General legal information only — not legal advice. No attorney-client relationship or privilege applies to this conversation.
      </div>

      {/* MESSAGES */}
      <main className="fc-messages">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === "user" ? "fc-msg-row fc-msg-row-user" : "fc-msg-row fc-msg-row-ai"}
          >
            {msg.role === "assistant" && (
              <div className="fc-avatar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
            )}
            <div className={msg.role === "user" ? "fc-bubble fc-bubble-user" : "fc-bubble fc-bubble-ai"}>
              {msg.role === "assistant"
                ? renderContent(msg.content)
                : <p>{msg.content}</p>}
            </div>
          </div>
        ))}

        {/* Streaming bubble */}
        {streamingText && (
          <div className="fc-msg-row fc-msg-row-ai">
            <div className="fc-avatar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="fc-bubble fc-bubble-ai fc-bubble-streaming">
              {renderContent(streamingText)}
              <span className="fc-cursor" />
            </div>
          </div>
        )}

        {/* Truncation notice — shown after stream ends when sentinel was detected */}
        {chatTruncated && !loading && (
          <div className="fc-msg-row fc-msg-row-ai">
            <div className="chat-truncation-notice" role="status">
              <span>⚠</span>
              <span>Response may be incomplete — feel free to ask me to continue where I left off.</span>
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {loading && !streamingText && (
          <div className="fc-msg-row fc-msg-row-ai">
            <div className="fc-avatar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="fc-bubble fc-bubble-ai fc-thinking">
              <span /><span /><span />
            </div>
          </div>
        )}

        {/* Upgrade card — shown after the AI has produced a summary (typically exchange 4+) */}
        {exchangeCount >= 4 && !loading && (
          <div className="fc-upgrade-card">
            <div className="fc-upgrade-card-body">
              <div className="fc-upgrade-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <p className="fc-upgrade-card-title">Ready to go deeper?</p>
                <p className="fc-upgrade-card-sub">
                  Phase II gives you a privileged channel supervised by Crawford Law — document drafting and attorney review within 48 hours.
                </p>
              </div>
            </div>
            <div className="fc-upgrade-card-actions">
              <button
                className="fc-upgrade-card-primary"
                onClick={() => router.push("/register?upgrade=phase2")}
              >
                Start Phase II · $9.99/mo
              </button>
              <button
                className="fc-upgrade-card-ghost"
                onClick={() => router.push("/register?upgrade=consult")}
              >
                Book a consult · $49.99
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* INPUT AREA */}
      <div className="fc-input-area">
        <form className="fc-input-form" onSubmit={sendMessage}>
          <textarea
            ref={textareaRef}
            className="fc-textarea"
            placeholder="Describe your situation…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button
            type="submit"
            className="fc-send-btn"
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
        <p className="fc-input-hint">
          Press Enter to send · Shift+Enter for new line
          <span className="fc-input-hint-sep">·</span>
          <button
            className="fc-input-upgrade-link"
            onClick={() => router.push("/register?upgrade=phase2")}
          >
            Upgrade to Phase II for privileged intake
          </button>
        </p>
      </div>
    </div>
  );
}
