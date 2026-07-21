"use client";

import { useState, useRef, useEffect, FormEvent, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

// Attorney FREESTYLE work-product chat, mounted inside a client's file. Talks to
// /api/attorney/chat, which reasons over this client's Living File but persists
// to attorney_workspace_messages — kept OUT of the client's privileged record.
export default function AttorneyFreestyleChat({ caseFileId }: { caseFileId: string }) {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Load this attorney's prior work-product for the case file on first open.
  const hydrate = useCallback(async () => {
    if (hydrated) return;
    setHydrated(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("attorney_workspace_messages")
      .select("role, content, created_at")
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: true });
    if (data?.length) {
      setMessages(data.map((m: { role: string; content: string }) => ({
        role: m.role as Msg["role"],
        content: m.content,
      })));
    }
  }, [caseFileId, hydrated]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) hydrate();
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setStreamingText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/attorney/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, caseFileId }),
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

      const TRUNC = "\x01TRUNCATED\x01";
      if (full.endsWith(TRUNC)) full = full.slice(0, -TRUNC.length);
      setMessages((prev) => [...prev, { role: "assistant", content: full }]);
      setStreamingText("");
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong — please try again." }]);
      setStreamingText("");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(e as unknown as FormEvent);
    }
  }

  return (
    <div className="atty-case-subsection">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 className="atty-case-subtitle" style={{ margin: 0 }}>
          Freestyle Workspace <span style={{ opacity: 0.6, fontWeight: 400 }}>· your work-product, not shared with the client</span>
        </h3>
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          style={{
            padding: "5px 14px",
            borderRadius: 999,
            border: "1px solid rgba(200,169,110,0.3)",
            background: open ? "var(--brand-gold)" : "transparent",
            color: open ? "#1a1206" : "var(--brand-cream-text, inherit)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {open ? "Close freestyle" : "Open freestyle"}
        </button>
      </div>

      {open && (
        <div
          style={{
            marginTop: 12,
            border: "1px solid rgba(200,169,110,0.18)",
            borderRadius: 12,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: 520,
          }}
        >
          <div style={{ padding: 12, overflowY: "auto", flex: 1, minHeight: 160 }}>
            {messages.length === 0 && !streamingText && (
              <p style={{ opacity: 0.6, fontSize: 13, margin: 0 }}>
                Think through this matter, stress-test the strategy, or draft against the client&apos;s file.
                Candid, peer-level, and grounded in the loaded Texas/federal authorities. Nothing here is
                visible to the client.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`atty-chat-msg ${m.role === "user" ? "atty-chat-user" : "atty-chat-assistant"}`}
                style={{ whiteSpace: "pre-wrap" }}
              >
                <span className="atty-chat-role">{m.role === "user" ? "You" : "Associate"}</span>
                {m.content}
              </div>
            ))}
            {streamingText && (
              <div className="atty-chat-msg atty-chat-assistant" style={{ whiteSpace: "pre-wrap" }}>
                <span className="atty-chat-role">Associate</span>
                {streamingText}
              </div>
            )}
            {loading && !streamingText && (
              <div style={{ opacity: 0.6, fontSize: 13 }}>Thinking…</div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={send}
            style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid rgba(200,169,110,0.14)" }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(); }}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask, analyze, or draft… (Enter to send, Shift+Enter for a new line)"
              disabled={loading}
              style={{
                flex: 1,
                resize: "none",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(200,169,110,0.2)",
                borderRadius: 8,
                padding: "8px 10px",
                color: "inherit",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                padding: "0 16px",
                borderRadius: 8,
                border: "none",
                background: "var(--brand-gold)",
                color: "#1a1206",
                fontWeight: 600,
                cursor: loading || !input.trim() ? "default" : "pointer",
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
