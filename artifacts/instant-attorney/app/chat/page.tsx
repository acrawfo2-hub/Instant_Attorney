"use client";

import { useState, useRef, useEffect, useCallback, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IntakeMessage, WIZARD_LABELS, LegalStrategy, ChatMode } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import QuickConsultModal from "@/components/QuickConsultModal";
import ExistingCounselModal from "@/components/ExistingCounselModal";
import type { ExistingCounselFormValue } from "@/components/ExistingCounselForm";
import VoiceInputButton, { VoiceUnsupportedNote } from "@/components/VoiceInputButton";
import AccountMenu from "@/components/AccountMenu";
import { phase2ExistingCounselNotice } from "@/lib/existing-counsel";
import type { CounselEngagementGoal } from "@/lib/types";

type Msg = Pick<IntakeMessage, "role" | "content"> & {
  // Local-only: object URL for a screenshot the user attached to this turn, so the
  // image stays visible in the chat history instead of collapsing to a [filename] tag.
  imageUrl?: string;
};

interface PendingAttachment {
  data: string;    // base64
  mimeType: string;
  fileName: string;
  previewUrl: string;
}

interface DocUpload {
  key: string;
  fileName: string;
  status: "uploading" | "ready" | "error";
}

const INITIAL_MESSAGE: Msg = {
  role: "assistant",
  content:
    "Welcome — this is your private case conversation. Everything you share here is confidential and protected by attorney-client privilege.\n\nI'll help build your case file as we talk. Share as much or as little as you're comfortable with right now.\n\nWhat's going on? Tell me about your situation.",
};

const MAX_INLINE_BYTES = 4 * 1024 * 1024; // 4 MB for inline screenshots (intake)
const MAX_FREESTYLE_BYTES = 10 * 1024 * 1024; // 10 MB for freestyle document attachments

// Freestyle accepts documents too, not just screenshots — the chat-acp backend
// already turns PDFs, Word docs, and text files into Anthropic content blocks.
const FREESTYLE_ATTACH_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain", "text/markdown", "text/csv", "text/html",
  "application/json", "application/rtf", "text/rtf",
]);

function renderContent(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line === "---LIVING FILE---") {
      const blockLines: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== "---END FILE---") {
        blockLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={`lf-${i}`} className="chat-lf-block">
          <div className="chat-lf-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Living File Updated
          </div>
          <div className="chat-lf-body">
            {blockLines.map((l, j) => {
              if (l.match(/^[A-Z ]+:$/)) return <p key={j} className="chat-lf-section">{l}</p>;
              if (l.startsWith("•")) return <p key={j} className="chat-lf-item">· {l.slice(1).trim()}</p>;
              return <p key={j} className="chat-lf-line">{l}</p>;
            })}
          </div>
        </div>
      );
    } else if (line.startsWith("[URGENT:") || line.startsWith("[URGENT]")) {
      elements.push(
        <div key={i} className="chat-urgent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{line.replace(/^\[URGENT:?\]\s*/, "")}</span>
        </div>
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="fc-msg-list">
          {items.map((item, j) => <li key={j}>{inlineBold(item)}</li>)}
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
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix — send raw base64
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AcpChatInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCaseFileId = searchParams.get("caseFileId");
  const isQuickConsult = searchParams.get("type") === "quick_consult";

  const [messages, setMessages] = useState<Msg[]>([INITIAL_MESSAGE]);
  const [mode, setMode] = useState<ChatMode>(
    searchParams.get("mode") === "freestyle" ? "freestyle" : "intake"
  );
  const [caseFileId, setCaseFileId] = useState<string | null>(urlCaseFileId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [chatTruncated, setChatTruncated] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  // Freestyle document attachments go through the storage-upload pipeline (not
  // inline base64), so large files don't blow the request-body limit. These
  // chips track their upload/analysis state.
  const [docUploads, setDocUploads] = useState<DocUpload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showQcModal, setShowQcModal] = useState(false);
  const [showCounselModal, setShowCounselModal] = useState(false);
  const [pendingCounselContext, setPendingCounselContext] = useState<ExistingCounselFormValue | null>(null);
  const [existingCounselBanner, setExistingCounselBanner] = useState<{
    name: string | null;
    goal: CounselEngagementGoal | null;
  } | null>(null);
  const [handoff, setHandoff] = useState<{ label: string; href: string } | null>(null);
  const [keepChatting, setKeepChatting] = useState(false);
  const [modeChooserOpen, setModeChooserOpen] = useState(!isQuickConsult);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);
  const caseFileIdRef = useRef<string | null>(caseFileId);
  const hasUserMessages = messages.some((m) => m.role === "user");
  const caseHomeHref = caseFileId ? `/dashboard/${caseFileId}` : "/dashboard";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, handoff]);

  // Keep the latest case file id reachable from the one-time page-hide handler.
  useEffect(() => {
    caseFileIdRef.current = caseFileId;
  }, [caseFileId]);

  // Flush the Living File when the page is hidden (tab close / navigation away)
  // via sendBeacon, so the conversation tail is never lost on exit.
  useEffect(() => {
    const onHide = () => {
      const id = caseFileIdRef.current;
      if (!id) return;
      const blob = new Blob([JSON.stringify({ caseFileId: id, force: true })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/chat-acp/sync-file", blob);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ── Resume an existing conversation ─────────────────────────────────────────
  // When the page is opened with ?caseFileId=… (returning to an existing file),
  // rehydrate the saved messages so a reload restores the chat instead of starting
  // blank. Inline screenshots are reattached to their original bubble via the
  // attachment→message link, using the durable /api/attachments/[id] URL (which
  // 302-redirects to a signed storage URL) so they survive the session. New chats
  // (no URL param) never hydrate, so a freshly-sent conversation is never clobbered.
  useEffect(() => {
    if (hydratedRef.current || !urlCaseFileId) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [{ data: msgs }, { data: atts }, { data: cf }] = await Promise.all([
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
        supabase
          .from("case_files")
          .select("chat_mode")
          .eq("id", urlCaseFileId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      // Resume the mode the client left this file in (unless the URL forces one).
      if (cf?.chat_mode === "freestyle" && searchParams.get("mode") !== "intake") {
        setMode("freestyle");
      }
      if (!msgs?.length) return;

      setModeChooserOpen(false);
      const imageByMessage = new Map<string, string>();
      (atts ?? []).forEach((a: { id: string; message_id: string | null }) => {
        if (a.message_id && !imageByMessage.has(a.message_id)) {
          imageByMessage.set(a.message_id, `/api/attachments/${a.id}`);
        }
      });

      const restored: Msg[] = msgs.map((m: { id: string; role: string; content: string }) => ({
        role: m.role as Msg["role"],
        content: m.content,
        ...(imageByMessage.has(m.id) ? { imageUrl: imageByMessage.get(m.id) } : {}),
      }));
      setMessages([INITIAL_MESSAGE, ...restored]);
    })();
    return () => {
      cancelled = true;
    };
  }, [urlCaseFileId]);

  // ── Existing-counsel intake gate ─────────────────────────────────────────────
  useEffect(() => {
    if (urlCaseFileId) {
      let cancelled = false;
      (async () => {
        const res = await fetch(`/api/case-files/${urlCaseFileId}/counsel-context`);
        if (!res.ok) {
          if (!cancelled) setShowCounselModal(true);
          return;
        }
        const data = await res.json() as {
          counsel_intake_at?: string | null;
          has_existing_counsel?: boolean | null;
          existing_counsel_name?: string | null;
          counsel_engagement_goal?: CounselEngagementGoal | null;
        };
        if (cancelled) return;
        if (data.counsel_intake_at) {
          setShowCounselModal(false);
          if (data.has_existing_counsel) {
            setExistingCounselBanner({
              name: data.existing_counsel_name ?? null,
              goal: data.counsel_engagement_goal ?? null,
            });
          }
        } else {
          setShowCounselModal(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    setShowCounselModal(true);
    return undefined;
  }, [urlCaseFileId]);

  function handleCounselComplete(value: ExistingCounselFormValue) {
    setShowCounselModal(false);
    if (value.has_existing_counsel) {
      setExistingCounselBanner({
        name: value.existing_counsel_name?.trim() || null,
        goal: value.counsel_engagement_goal,
      });
    } else {
      setExistingCounselBanner(null);
    }
    if (!caseFileId && !urlCaseFileId) {
      setPendingCounselContext(value);
    }
  }

  function handleCounselSkip() {
    setShowCounselModal(false);
  }

  // ── Ready signal ───────────────────────────────────────────────────────────
  // The conversation reaches its handoff point once the attorney strategy has
  // actually been established (a document is recommended) — NOT just a message
  // count. We read the case file's legal_strategy directly (browser client) and
  // name the recommended document so the next step is unmistakable. The strategy
  // is written server-side just after a reply, so we retry briefly to win the race.
  useEffect(() => {
    if (isQuickConsult || !caseFileId || handoff || loading) return;
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
  }, [messages, loading, caseFileId, handoff, isQuickConsult]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // Force a Living File sweep of the conversation tail (fire-and-forget). Used
  // when the client leaves or switches modes, so anything since the last
  // automatic background sweep still lands in the file.
  const flushLivingFile = useCallback(() => {
    const id = caseFileIdRef.current;
    if (!id) return;
    fetch("/api/chat-acp/sync-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseFileId: id, force: true }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  // Switch between guided intake and freestyle. Reflect the choice in the URL so
  // a reload keeps the mode; the server also persists it to the case file on the
  // next send, so returning later resumes it too. Flush first so the tail of the
  // mode being left is captured into the file.
  function changeMode(next: ChatMode) {
    if (next === mode) return;
    flushLivingFile();
    setMode(next);
    setModeChooserOpen(false);
    if (next === "freestyle") {
      setModeNotice("Open conversation mode — ask freely, attach documents, and draft here. Your case file still updates in the background.");
    } else {
      setModeNotice("Step-by-step mode — I'll ask one focused question at a time.");
    }
    const params = new URLSearchParams(window.location.search);
    params.set("mode", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  const attachFile = useCallback(async (file: File) => {
    // Images go inline (base64) — small and shown in the bubble immediately.
    if (file.type.startsWith("image/")) {
      if (file.size > MAX_INLINE_BYTES) {
        alert("Screenshots must be under 4 MB. For larger files, use the Upload Documents section on your dashboard.");
        return;
      }
      const data = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      setPendingAttachment({ data, mimeType: file.type, fileName: file.name || "screenshot.png", previewUrl });
      return;
    }

    // Documents (freestyle only) go through the storage-upload pipeline rather
    // than inline base64, so large files don't exceed the request-body limit.
    // They're stored, correctly typed, and analyzed into the Living File.
    if (mode !== "freestyle" || !FREESTYLE_ATTACH_TYPES.has(file.type)) {
      if (mode === "freestyle") {
        alert("Freestyle accepts images, PDFs, Word documents, and text files.");
      }
      return;
    }
    if (file.size > MAX_FREESTYLE_BYTES) {
      alert("Attachments must be under 20 MB. For larger files, use the Upload Documents section on your dashboard.");
      return;
    }
    const id = caseFileIdRef.current;
    if (!id) {
      alert("Send a message first, then attach documents so they can be added to your file.");
      return;
    }
    const key = `${file.name}-${Date.now()}`;
    setDocUploads((prev) => [...prev, { key, fileName: file.name || "document", status: "uploading" }]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("caseFileId", id);
      const res = await fetch("/api/attachments/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const msg = res.status === 413 ? "File is too large to upload." : "Upload failed.";
        throw new Error(msg);
      }
      setDocUploads((prev) => prev.map((d) => (d.key === key ? { ...d, status: "ready" } : d)));
    } catch (err) {
      setDocUploads((prev) => prev.map((d) => (d.key === key ? { ...d, status: "error" } : d)));
      alert(err instanceof Error ? err.message : "Upload failed.");
    }
  }, [mode]);

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
    if ((!text && !pendingAttachment) || loading || showCounselModal) return;

    const attachment = pendingAttachment;

    const displayContent = attachment
      ? text ? `[${attachment.fileName}] ${text}` : `[${attachment.fileName}]`
      : text;

    const userMsg: Msg = {
      role: "user",
      content: displayContent,
      // Only images render inline as <img>; documents show as their [filename]
      // tag in the bubble text instead of a broken image.
      ...(attachment && attachment.mimeType.startsWith("image/")
        ? { imageUrl: attachment.previewUrl }
        : {}),
    };
    setModeChooserOpen(false);
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setStreamingText("");

    // Hand the object URL off to the sent message so it stays visible in history.
    // Do NOT revoke it here (clearAttachment would) — the message bubble now owns it.
    setPendingAttachment(null);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      // For API, use plain text content (not the display content with filename prefix)
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
          mode,
          ...(isQuickConsult ? { fileType: "quick_consult" } : {}),
          ...(attachment ? { pendingAttachment: { data: attachment.data, mimeType: attachment.mimeType, fileName: attachment.fileName } } : {}),
          ...(pendingCounselContext
            ? {
                counselContext: {
                  has_existing_counsel: pendingCounselContext.has_existing_counsel,
                  unsure: pendingCounselContext.unsure,
                  existing_counsel_name: pendingCounselContext.existing_counsel_name,
                  counsel_engagement_goal: pendingCounselContext.counsel_engagement_goal,
                },
              }
            : {}),
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
              // Put the new file's id in the URL so a reload mid-session resumes
              // this conversation. Mark it already-hydrated so the resume effect
              // never overwrites the live in-memory chat from the DB.
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
      setPendingCounselContext(null);
      // Resolved doc uploads are now in the file context; keep only in-flight ones.
      setDocUploads((prev) => prev.filter((d) => d.status === "uploading"));
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I'm sorry — something went wrong. Please try again." },
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
        <button className="fc-topbar-logo" onClick={() => router.push("/dashboard")}>
          <div className="fc-logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span>Instant-Attorney</span>
        </button>

        <div className="fc-topbar-center">
          {!isQuickConsult && (
          <div
            className="fc-mode-toggle"
            role="tablist"
            aria-label="Conversation mode"
            style={{
              display: "inline-flex",
              gap: 2,
              padding: 2,
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(200,169,110,0.18)",
            }}
          >
            {(["intake", "freestyle"] as ChatMode[]).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeMode(m)}
                  title={
                    m === "intake"
                      ? "Step-by-step — one question at a time, builds your case file"
                      : "Open conversation — talk freely, attach documents, draft here"
                  }
                  style={{
                    padding: "5px 14px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    background: active ? "var(--brand-gold)" : "transparent",
                    color: active ? "#1a1206" : "var(--brand-cream-text)",
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {m === "intake" ? "Step-by-step" : "Open conversation"}
                </button>
              );
            })}
          </div>
          )}
        </div>

        <div className="fc-topbar-right">
          {isQuickConsult && hasUserMessages ? (
            <button
              className="fc-upgrade-btn"
              style={{ background: "rgba(200,169,110,0.15)", color: "var(--brand-gold)" }}
              onClick={() => isQuickConsult && hasUserMessages ? setShowQcModal(true) : router.push(caseHomeHref)}
            >
              Save to a case file
            </button>
          ) : (
            <button
              className="fc-upgrade-btn"
              style={{ background: "rgba(255,255,255,0.07)", color: "var(--brand-cream-text)" }}
              onClick={() => isQuickConsult && hasUserMessages ? setShowQcModal(true) : router.push(caseHomeHref)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              {isQuickConsult ? "All cases" : "Open your case"}
            </button>
          )}
          <AccountMenu />
        </div>
      </header>

      {/* QUICK CONSULT BANNER */}
      {isQuickConsult && (
        <div className="fc-qc-banner">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          One-off question — private, but not saved to a case file unless you choose to. Click <strong>Save to a case file</strong> when done.
        </div>
      )}

      {/* PRIVILEGE NOTICE (standard intake only) */}
      {!isQuickConsult && (
        <div className="fc-disclaimer" style={{ color: "rgba(200,169,110,0.6)", borderColor: "rgba(200,169,110,0.12)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          This conversation is protected by attorney-client privilege pursuant to your signed Crawford Law representation agreement.
        </div>
      )}

      {/* EXISTING COUNSEL BANNER */}
      {existingCounselBanner && (
        <div className="ec-chat-banner">
          {phase2ExistingCounselNotice(existingCounselBanner.name, existingCounselBanner.goal)}
        </div>
      )}

      {/* EXISTING COUNSEL INTAKE MODAL */}
      {showCounselModal && (
        <ExistingCounselModal
          caseFileId={caseFileId ?? urlCaseFileId}
          onComplete={handleCounselComplete}
          onSkip={handleCounselSkip}
        />
      )}

      {/* QUICK CONSULT SAVE MODAL */}
      {showQcModal && caseFileId && (
        <QuickConsultModal
          caseFileId={caseFileId}
          onClose={() => setShowQcModal(false)}
        />
      )}

      {/* MESSAGES */}
      <main className="fc-messages">
        {modeChooserOpen && !hasUserMessages && !isQuickConsult && (
          <div className="fc-mode-chooser">
            <p className="fc-mode-chooser-title">How would you like to talk?</p>
            <div className="fc-mode-chooser-actions">
              <button
                type="button"
                className="fc-mode-chooser-card"
                onClick={() => changeMode("intake")}
              >
                <strong>Step-by-step</strong>
                <span>Recommended — I ask one focused question at a time and build your case file.</span>
              </button>
              <button
                type="button"
                className="fc-mode-chooser-card"
                onClick={() => changeMode("freestyle")}
              >
                <strong>Open conversation</strong>
                <span>Talk freely, attach documents, and draft here. Your case file still updates.</span>
              </button>
            </div>
          </div>
        )}
        {modeNotice && (
          <div className="fc-mode-notice" role="status">{modeNotice}</div>
        )}
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
              {msg.role === "assistant" ? (
                renderContent(msg.content)
              ) : msg.imageUrl ? (
                <>
                  <img src={msg.imageUrl} alt="attached screenshot" className="fc-bubble-image" />
                  {(() => {
                    // Image is shown, so drop the redundant leading [filename] tag.
                    const caption = msg.content.replace(/^\[[^\]]*\]\s*/, "");
                    return caption ? <p>{caption}</p> : null;
                  })()}
                </>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

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

        {/* CLOSING HANDOFF MESSAGE — appears once a strategy/document is recommended */}
        {handoff && !loading && (
          <div className="fc-msg-row fc-msg-row-ai">
            <div className="fc-avatar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="fc-bubble fc-bubble-ai">
              <div className="fc-handoff-card">
                <span className="fc-handoff-eyebrow">✓ Your case file is ready</span>
                <p className="fc-handoff-headline">Here&apos;s what happens next</p>
                <p>
                  I&apos;ve built your case file and mapped out your legal strategy. Your
                  recommended next step is to create your <strong>{handoff.label}</strong>.
                </p>
                <p>
                  Open your case to review everything and start the document — I&apos;ll draft it for
                  you, and Andrew Crawford, Esq. will review it once you send it. You can come back
                  and keep chatting here anytime.
                </p>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* HANDOFF ACTION / INPUT — at the "ready" point the composer is replaced by the
          one obvious next step, with a small link back to chatting if needed. */}
      {handoff && !keepChatting ? (
        <div className="fc-handoff-actions">
          <button className="fc-handoff-btn" onClick={() => router.push(handoff.href)}>
            Open my case → Start my {handoff.label}
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
              <span className="fc-file-cta-eyebrow">⚡ Your case file is ready</span>
              <span className="fc-file-cta-headline">Next step: create your {handoff.label}</span>
            </div>
            <button className="fc-file-cta-btn" onClick={() => router.push(handoff.href)}>
              Open my case →
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
        {/* Document uploads (freestyle) — added to the file + analyzed, not sent inline */}
        {docUploads.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {docUploads.map((d) => (
              <span
                key={d.key}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 10px", borderRadius: 999, fontSize: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${d.status === "error" ? "rgba(220,80,80,0.5)" : "rgba(200,169,110,0.25)"}`,
                  color: "var(--brand-cream-text)",
                }}
              >
                <span aria-hidden>{d.status === "error" ? "⚠" : "📄"}</span>
                {d.fileName}
                <span style={{ opacity: 0.6 }}>
                  {d.status === "uploading" ? "· adding…" : d.status === "ready" ? "· added to your file" : "· failed"}
                </span>
                <button
                  onClick={() => setDocUploads((prev) => prev.filter((x) => x.key !== d.key))}
                  aria-label="Dismiss"
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.7, padding: 0, lineHeight: 1 }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Attachment preview — thumbnail for images, a doc chip for files */}
        {pendingAttachment && (
          <div className="fc-attachment-preview">
            {pendingAttachment.mimeType.startsWith("image/") ? (
              <img src={pendingAttachment.previewUrl} alt="attachment preview" className="fc-attachment-thumb" />
            ) : (
              <span className="fc-attachment-thumb" aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📄</span>
            )}
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
            placeholder={
              dragOver
                ? mode === "freestyle" ? "Drop a file here…" : "Drop screenshot here…"
                : mode === "freestyle"
                  ? "Ask anything, think it through, or ask me to draft… attach a document to work from"
                  : "Share the details of your situation… or paste a screenshot"
            }
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
          {mode === "freestyle"
            ? "Paste or drag images, PDFs, or Word docs"
            : "Paste or drag a screenshot to attach"}
          <span className="fc-input-hint-sep">·</span>
          <button className="fc-input-upgrade-link" onClick={() => router.push(caseHomeHref)}>
            Open your case
          </button>
        </p>
        <VoiceUnsupportedNote />
      </div>
      </>
      )}
    </div>
  );
}

export default function AcpChatPage() {
  return (
    <Suspense>
      <AcpChatInner />
    </Suspense>
  );
}
