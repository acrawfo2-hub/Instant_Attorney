"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WIZARD_LABELS, LegalStrategy } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import QuickConsultModal from "@/components/QuickConsultModal";
import VoiceInputButton, { VoiceUnsupportedNote } from "@/components/VoiceInputButton";
import AccountMenu from "@/components/AccountMenu";
import ChatMessageBubble, { type ChatMsg } from "@/components/chat/ChatMessageBubble";
import StreamingBubble from "@/components/chat/StreamingBubble";

interface PendingAttachment {
  data: string;
  mimeType: string;
  fileName: string;
  previewUrl: string;
}

const INITIAL_MESSAGE: ChatMsg = {
  id: "welcome",
  role: "assistant",
  content:
    "Welcome — this is your privileged Phase II intake channel, protected by the Crawford Law representation agreement you've signed.\n\nEverything you share here is confidential and covered by attorney-client privilege. I'll be building your Living File as we talk, so please share as much or as little as you're comfortable with right now.\n\nWhat's going on? Tell me about your situation.",
};

const MAX_INLINE_BYTES = 4 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function newMsgId() {
  return crypto.randomUUID();
}

interface AcpChatClientProps {
  accountName?: string;
  accountEmail?: string;
}

export default function AcpChatClient({ accountName, accountEmail }: AcpChatClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCaseFileId = searchParams.get("caseFileId");
  const isQuickConsult = searchParams.get("type") === "quick_consult";

  const [messages, setMessages] = useState<ChatMsg[]>([INITIAL_MESSAGE]);
  const [caseFileId, setCaseFileId] = useState<string | null>(urlCaseFileId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [chatTruncated, setChatTruncated] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showQcModal, setShowQcModal] = useState(false);
  const [handoff, setHandoff] = useState<{ label: string; href: string } | null>(null);
  const [keepChatting, setKeepChatting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);
  const prevLoadingRef = useRef(false);
  const mountHandoffCheckedRef = useRef(false);
  const streamTextRef = useRef("");
  const streamRafRef = useRef<number | null>(null);
  const hasUserMessages = messages.some((m) => m.role === "user");

  const flushStreamingText = useCallback((text: string) => {
    if (streamRafRef.current !== null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
    streamTextRef.current = text;
    setStreamingText(text);
  }, []);

  const scheduleStreamingUpdate = useCallback((text: string) => {
    streamTextRef.current = text;
    if (streamRafRef.current !== null) return;
    streamRafRef.current = requestAnimationFrame(() => {
      streamRafRef.current = null;
      setStreamingText(streamTextRef.current);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (streamRafRef.current !== null) cancelAnimationFrame(streamRafRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, handoff]);

  useEffect(() => {
    if (hydratedRef.current || !urlCaseFileId) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [{ data: msgs }, { data: atts }] = await Promise.all([
        supabase
          .from("intake_messages")
          .select("id, role, content, created_at")
          .eq("case_file_id", urlCaseFileId)
          .order("created_at", { ascending: true }),
        supabase
          .from("attachments")
          .select("id, message_id")
          .eq("case_file_id", urlCaseFileId)
          .eq("attachment_type", "screenshot")
          .not("message_id", "is", null),
      ]);
      if (cancelled || !msgs?.length) return;

      const imageByMessage = new Map<string, string>();
      (atts ?? []).forEach((a: { id: string; message_id: string | null }) => {
        if (a.message_id && !imageByMessage.has(a.message_id)) {
          imageByMessage.set(a.message_id, `/api/attachments/${a.id}`);
        }
      });

      const restored: ChatMsg[] = msgs.map((m: { id: string; role: string; content: string }) => ({
        id: m.id,
        role: m.role as ChatMsg["role"],
        content: m.content,
        ...(imageByMessage.has(m.id) ? { imageUrl: imageByMessage.get(m.id) } : {}),
      }));
      setMessages([INITIAL_MESSAGE, ...restored]);
    })();
    return () => {
      cancelled = true;
    };
  }, [urlCaseFileId]);

  // Poll for legal_strategy handoff only after a stream completes or on resume — not on every message update.
  useEffect(() => {
    if (isQuickConsult || !caseFileId || handoff) return;

    const streamJustEnded = prevLoadingRef.current && !loading;
    const shouldCheckOnResume =
      !!urlCaseFileId && !mountHandoffCheckedRef.current && !loading;
    prevLoadingRef.current = loading;

    if (!streamJustEnded && !shouldCheckOnResume) return;
    if (shouldCheckOnResume) mountHandoffCheckedRef.current = true;

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        const { data } = await supabase
          .from("case_files")
          .select("legal_strategy")
          .eq("id", caseFileId)
          .single();
        const strategy = data?.legal_strategy as LegalStrategy | null;
        const wType = (strategy?.recommended_wizards ?? []).find((w) => Object.hasOwn(WIZARD_LABELS, w));
        if (wType) {
          if (!cancelled) {
            setHandoff({ label: WIZARD_LABELS[wType], href: `/dashboard/${caseFileId}` });
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 1300));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, caseFileId, handoff, isQuickConsult, urlCaseFileId]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  const attachFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_INLINE_BYTES) {
      alert("Screenshots must be under 4 MB. For larger files, use the Upload Documents section on your dashboard.");
      return;
    }
    const data = await fileToBase64(file);
    const previewUrl = URL.createObjectURL(file);
    setPendingAttachment({ data, mimeType: file.type, fileName: file.name || "screenshot.png", previewUrl });
  }, []);

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) attachFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) attachFile(file);
  }

  function clearAttachment() {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && !pendingAttachment) || loading) return;

    const attachment = pendingAttachment;

    const displayContent = attachment
      ? text ? `[${attachment.fileName}] ${text}` : `[${attachment.fileName}]`
      : text;

    const userMsg: ChatMsg = {
      id: newMsgId(),
      role: "user",
      content: displayContent,
      ...(attachment ? { imageUrl: attachment.previewUrl } : {}),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    flushStreamingText("");

    setPendingAttachment(null);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const apiMessages = nextMessages.map((m, idx) => ({
        role: m.role,
        content: idx === nextMessages.length - 1 ? text : m.content,
      }));

      const res = await fetch("/api/chat-acp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          caseFileId,
          ...(isQuickConsult ? { fileType: "quick_consult" } : {}),
          ...(attachment ? { pendingAttachment: { data: attachment.data, mimeType: attachment.mimeType, fileName: attachment.fileName } } : {}),
        }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        if (firstChunk && chunk.startsWith("\x00")) {
          const end = chunk.indexOf("\x00", 1);
          if (end !== -1) {
            const id = chunk.slice(1, end);
            if (id) {
              setCaseFileId(id);
              if (!urlCaseFileId) {
                hydratedRef.current = true;
                const params = new URLSearchParams(window.location.search);
                params.set("caseFileId", id);
                window.history.replaceState(null, "", `?${params.toString()}`);
              }
            }
            full += chunk.slice(end + 1);
          } else {
            full += chunk;
          }
          firstChunk = false;
        } else {
          full += chunk;
          firstChunk = false;
        }

        scheduleStreamingUpdate(full);
      }

      const TRUNC_SENTINEL = "\x01TRUNCATED\x01";
      if (full.endsWith(TRUNC_SENTINEL)) {
        full = full.slice(0, -TRUNC_SENTINEL.length);
        setChatTruncated(true);
      } else {
        setChatTruncated(false);
      }
      flushStreamingText("");
      setMessages((prev) => [...prev, { id: newMsgId(), role: "assistant", content: full }]);
    } catch {
      flushStreamingText("");
      setMessages((prev) => [
        ...prev,
        { id: newMsgId(), role: "assistant", content: "I'm sorry — something went wrong. Please try again." },
      ]);
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
      <header className="fc-topbar">
        <button className="fc-topbar-logo" onClick={() => router.push("/dashboard")}>
          <div className="fc-logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span>Instant-Attorney</span>
        </button>

        <div className="fc-topbar-center">
          <span className="fc-phase-label">
            {isQuickConsult ? "Quick Question · ACP Protected" : "Phase II · Privileged Intake"}
          </span>
        </div>

        <div className="fc-topbar-right">
          {isQuickConsult && hasUserMessages ? (
            <button
              className="fc-upgrade-btn"
              style={{ background: "rgba(200,169,110,0.15)", color: "var(--brand-gold)" }}
              onClick={() => caseFileId ? setShowQcModal(true) : router.push("/dashboard")}
            >
              Save or Close
            </button>
          ) : (
            <button
              className="fc-upgrade-btn"
              style={{ background: "rgba(255,255,255,0.07)", color: "var(--brand-cream-text)" }}
              onClick={() => isQuickConsult && hasUserMessages ? setShowQcModal(true) : router.push("/dashboard")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              {isQuickConsult ? "All Files" : "View File"}
            </button>
          )}
          <AccountMenu name={accountName} email={accountEmail} />
        </div>
      </header>

      {isQuickConsult && (
        <div className="fc-qc-banner">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Quick Question — this conversation is ACP-protected but will be archived in 7 days unless you save it. Click <strong>Save or Close</strong> when done.
        </div>
      )}

      {!isQuickConsult && (
        <div className="fc-disclaimer" style={{ color: "rgba(200,169,110,0.6)", borderColor: "rgba(200,169,110,0.12)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          This conversation is protected by attorney-client privilege pursuant to your signed Crawford Law representation agreement.
        </div>
      )}

      {showQcModal && caseFileId && (
        <QuickConsultModal
          caseFileId={caseFileId}
          onClose={() => setShowQcModal(false)}
        />
      )}

      <main className="fc-messages">
        {messages.map((msg) => (
          <ChatMessageBubble key={msg.id} msg={msg} />
        ))}

        {streamingText && <StreamingBubble text={streamingText} />}

        {chatTruncated && !loading && (
          <div className="fc-msg-row fc-msg-row-ai">
            <div className="chat-truncation-notice" role="status">
              <span>⚠</span>
              <span>Response may be incomplete — feel free to ask me to continue where I left off.</span>
            </div>
          </div>
        )}

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

        {handoff && !loading && (
          <div className="fc-msg-row fc-msg-row-ai">
            <div className="fc-avatar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="fc-bubble fc-bubble-ai">
              <div className="fc-handoff-card">
                <span className="fc-handoff-eyebrow">✓ Your file is ready</span>
                <p className="fc-handoff-headline">Here&apos;s what happens next</p>
                <p>
                  I&apos;ve built your Living File and mapped out your legal strategy. Your
                  recommended next step is to create your <strong>{handoff.label}</strong>.
                </p>
                <p>
                  Open your file to review everything and start the document — I&apos;ll draft it for
                  you, and Andrew Crawford, Esq. will review it once you send it. You can come back
                  and keep chatting here anytime.
                </p>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {handoff && !keepChatting ? (
        <div className="fc-handoff-actions">
          <button className="fc-handoff-btn" onClick={() => router.push(handoff.href)}>
            Open my file → Start my {handoff.label}
          </button>
          <button className="fc-handoff-keep" onClick={() => setKeepChatting(true)}>
            Still have a question? Keep chatting
          </button>
        </div>
      ) : (
      <>
      {handoff && keepChatting && (
        <div className="fc-file-cta">
          <div className="fc-file-cta-inner">
            <div className="fc-file-cta-text">
              <span className="fc-file-cta-eyebrow">⚡ Your file is ready</span>
              <span className="fc-file-cta-headline">Next step: create your {handoff.label}</span>
            </div>
            <button className="fc-file-cta-btn" onClick={() => router.push(handoff.href)}>
              Open my file →
            </button>
          </div>
        </div>
      )}
      <div
        ref={inputAreaRef}
        className={`fc-input-area${dragOver ? " fc-input-area-dragover" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {pendingAttachment && (
          <div className="fc-attachment-preview">
            <img src={pendingAttachment.previewUrl} alt="attachment preview" className="fc-attachment-thumb" />
            <span className="fc-attachment-name">{pendingAttachment.fileName}</span>
            <button className="fc-attachment-clear" onClick={clearAttachment} aria-label="Remove attachment">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        <form className="fc-input-form" onSubmit={sendMessage}>
          <textarea
            ref={textareaRef}
            className="fc-textarea"
            placeholder={dragOver ? "Drop screenshot here…" : "Share the details of your situation… or paste a screenshot"}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            disabled={loading}
          />
          <VoiceInputButton
            disabled={loading}
            onTranscript={(t) => {
              setInput((v) => (v.trim() ? `${v.trim()} ${t}` : t));
              requestAnimationFrame(autoResize);
            }}
          />
          <button
            type="submit"
            className="fc-send-btn"
            disabled={loading || (!input.trim() && !pendingAttachment)}
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
        <p className="fc-input-hint">
          Enter to send · Shift+Enter for new line
          <span className="fc-input-hint-sep">·</span>
          Paste or drag a screenshot to attach
          <span className="fc-input-hint-sep">·</span>
          <button className="fc-input-upgrade-link" onClick={() => router.push("/dashboard")}>
            View Living File
          </button>
        </p>
        <VoiceUnsupportedNote />
      </div>
      </>
      )}
    </div>
  );
}
