"use client";

import { useState, useRef, useEffect, useCallback, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IntakeMessage, ChatMode } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import QuickConsultModal from "@/components/QuickConsultModal";
import ExistingCounselModal from "@/components/ExistingCounselModal";
import type { ExistingCounselFormValue } from "@/components/ExistingCounselForm";
import VoiceInputButton, { VoiceUnsupportedNote } from "@/components/VoiceInputButton";
import AccountMenu from "@/components/AccountMenu";
import ChatDraftsPanel from "@/components/ChatDraftsPanel";
import { phase2ExistingCounselNotice } from "@/lib/existing-counsel";
import { parseDrafts, stripDraftsForDisplay } from "@/lib/freestyle-drafts";
import { stripToolMarkers, activeToolNames } from "@/lib/tool-markers";
import { placeholderFields } from "@/lib/wizard-parsing";
import ToolRunChips from "@/components/ToolRunChips";
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

function renderContent(text: string, onOpenDraft?: (title: string) => void) {
  // Freestyle drafts live in the side panel, not the transcript — pull the
  // document blocks out and leave a compact marker where each one was.
  const drafted = parseDrafts(text);
  const lines = stripDraftsForDisplay(text).split("\n");
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

  for (const d of drafted) {
    elements.push(
      <button
        key={`draft-${d.title}`}
        type="button"
        className="fc-draft-note fc-draft-note-btn"
        onClick={onOpenDraft ? () => onOpenDraft(d.title) : undefined}
        disabled={!onOpenDraft}
        title="Open this draft"
      >
        <span className="fc-draft-note-icon">📄</span>
        <span className="fc-draft-note-label">{d.title}</span>
        <span className="fc-draft-note-cta">open draft →</span>
      </button>
    );
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
  const urlFocusDraftId = searchParams.get("draft");
  const isQuickConsult = searchParams.get("type") === "quick_consult";

  const [messages, setMessages] = useState<Msg[]>([INITIAL_MESSAGE]);
  // One conversation, no mode toggle: the assistant is the orchestrator and paces
  // itself (a focused question when it needs a fact, open when you want to think).
  // It always runs in the tools-enabled "freestyle" behavior.
  const mode: ChatMode = "freestyle";
  const [caseFileId, setCaseFileId] = useState<string | null>(urlCaseFileId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [chatTruncated, setChatTruncated] = useState(false);
  // Freestyle split-screen drafts panel. `draftsRefresh` bumps to tell the panel
  // to reload after the assistant produces a new draft.
  const [draftsPanelOpen, setDraftsPanelOpen] = useState(false);
  const [draftsRefresh, setDraftsRefresh] = useState(0);
  // Orchestrator tools currently running this turn (transient "running…" chips).
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  // Freestyle document attachments go through the storage-upload pipeline (not
  // inline base64), so large files don't blow the request-body limit. These
  // chips track their upload/analysis state.
  const [docUploads, setDocUploads] = useState<DocUpload[]>([]);
  // Docs queued before the first message (no caseFileId yet). Uploaded as soon
  // as caseFileId becomes available.
  const [queuedDocFiles, setQueuedDocFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // When the AI saves a new draft, show a dismissible banner so users know where it went.
  const [draftSavedTitle, setDraftSavedTitle] = useState<string | null>(null);
  // Count badge on the Drafts button — loaded once caseFileId is known, refreshed
  // each time draftsRefresh bumps.
  const [draftCount, setDraftCount] = useState(0);
  const [showQcModal, setShowQcModal] = useState(false);
  const [showCounselModal, setShowCounselModal] = useState(false);
  const [pendingCounselContext, setPendingCounselContext] = useState<ExistingCounselFormValue | null>(null);
  const [existingCounselBanner, setExistingCounselBanner] = useState<{
    name: string | null;
    goal: CounselEngagementGoal | null;
  } | null>(null);
  // Which draft the panel should jump to. Bumping `draftFocusNonce` re-triggers
  // the selection even when the same draft is clicked twice in a row.
  const [draftFocus, setDraftFocus] = useState<{ id: string | null; title: string | null; nonce: number }>(
    { id: urlFocusDraftId, title: null, nonce: urlFocusDraftId ? 1 : 0 },
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  const caseFileIdRef = useRef<string | null>(caseFileId);
  const hasUserMessages = messages.some((m) => m.role === "user");
  const caseHomeHref = caseFileId ? `/dashboard/${caseFileId}` : "/dashboard";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Keep the draft count badge on the Drafts button current.
  useEffect(() => {
    if (!caseFileId) return;
    fetch(`/api/workspace/drafts?caseFileId=${caseFileId}`)
      .then((r) => r.ok ? r.json() : { drafts: [] })
      .then((d) => setDraftCount((d.drafts ?? []).length))
      .catch(() => {});
  }, [caseFileId, draftsRefresh]);

  // When caseFileId becomes available (first message sent), upload any docs the
  // user had already attached before the conversation started.
  useEffect(() => {
    if (!caseFileId || queuedDocFiles.length === 0) return;
    const files = [...queuedDocFiles];
    setQueuedDocFiles([]);
    files.forEach((file) => {
      const key = `${file.name}-${Date.now()}`;
      setDocUploads((prev) => [...prev, { key, fileName: file.name || "document", status: "uploading" }]);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("caseFileId", caseFileId);
      fetch("/api/attachments/upload", { method: "POST", body: fd })
        .then((res) => {
          if (!res.ok) throw new Error(res.status === 413 ? "File is too large." : "Upload failed.");
          setDocUploads((prev) => prev.map((d) => (d.key === key ? { ...d, status: "ready" } : d)));
        })
        .catch(() => {
          setDocUploads((prev) => prev.map((d) => (d.key === key ? { ...d, status: "error" } : d)));
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseFileId]);

  // Open the drafts panel and jump it to a specific draft (by title or id). Wired
  // to the in-chat draft chips and to a ?draft= deep link from the case file.
  const openDraft = useCallback((opts: { id?: string | null; title?: string | null }) => {
    setDraftsPanelOpen(true);
    setDraftsRefresh((n) => n + 1);
    setDraftFocus((prev) => ({ id: opts.id ?? null, title: opts.title ?? null, nonce: prev.nonce + 1 }));
  }, []);

  // Keep the latest case file id reachable from the one-time page-hide handler.
  useEffect(() => {
    caseFileIdRef.current = caseFileId;
  }, [caseFileId]);

  // Deep link from the case file — ?draft=<id> opens the panel to that draft.
  useEffect(() => {
    if (urlFocusDraftId) setDraftsPanelOpen(true);
  }, [urlFocusDraftId]);

  // Organize on leave: when the page is hidden (tab close / navigation away),
  // sendBeacon so the conversation tail is folded into the Living File and — for a
  // freestyle session — a short "where we left off" recap is distilled for the
  // client's next visit. The endpoint debounces the recap, so rapid tab switches
  // with no new messages stay cheap.
  useEffect(() => {
    const onHide = () => {
      const id = caseFileIdRef.current;
      if (!id) return;
      const blob = new Blob([JSON.stringify({ caseFileId: id, mode: "freestyle" })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/chat-acp/organize", blob);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      // In-app (SPA) navigation away — e.g. clicking "Open your case" — doesn't
      // fire pagehide, so organize here too. keepalive lets it outlive the
      // unmount; the endpoint debounces so this stays cheap.
      const id = caseFileIdRef.current;
      if (id) {
        fetch("/api/chat-acp/organize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseFileId: id, mode: "freestyle" }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, []);

  // ── Fresh conversation on return ────────────────────────────────────────────
  // Reopening an existing file (?caseFileId=…) does NOT replay the whole prior
  // transcript — that made the chat feel like a long, confusing thread to catch up
  // on. Instead we open a fresh conversation with a short "welcome back" that names
  // the concrete next step from next_action (written by the Living File extractor),
  // then lists any drafts that still have blanks to fill. The orchestrator still sees
  // the full file server-side via buildFileContext, and the complete message
  // history remains in the file/DB — it's just not dumped into the thread here.
  useEffect(() => {
    if (hydratedRef.current || !urlCaseFileId || isQuickConsult) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      const supabase = createClient();

      // Fetch case-file metadata and pending drafts in parallel
      const [cfRes, docsRes] = await Promise.all([
        supabase
          .from("case_files")
          .select("chat_session_summary, next_action")
          .eq("id", urlCaseFileId)
          .maybeSingle(),
        supabase
          .from("documents")
          .select("title, draft_text, status")
          .eq("case_file_id", urlCaseFileId)
          .in("status", ["draft", "pending_review"]),
      ]);

      if (cancelled) return;

      const cf = cfRes.data as { chat_session_summary: string | null; next_action: string | null } | null;
      const docs = (docsRes.data ?? []) as { title: string; draft_text: string | null; status: string }[];

      const recap = cf?.chat_session_summary?.trim() || null;
      const nextAction = cf?.next_action?.trim() || null;

      // Summarise drafts that still have unfilled blanks
      const draftsWithBlanks = docs
        .filter((d) => d.draft_text && placeholderFields(d.draft_text).length > 0)
        .map((d) => ({
          title: d.title,
          blanks: placeholderFields(d.draft_text!).length,
        }));

      // Build the specific, concise welcome
      const lines: string[] = [];
      lines.push("Welcome back — your case file is open in front of me.\n");

      if (nextAction) {
        lines.push(`**Where we left off:** ${nextAction}`);
      } else if (recap) {
        lines.push(`**Last time:** ${recap}`);
      }

      if (draftsWithBlanks.length > 0) {
        const draftSummary = draftsWithBlanks
          .map((d) => `*${d.title}* (${d.blanks} blank${d.blanks === 1 ? "" : "s"} to fill)`)
          .join(", ");
        lines.push(`\nYou also have ${draftsWithBlanks.length === 1 ? "a draft" : "drafts"} with blanks still open: ${draftSummary}.`);
      }

      lines.push(
        draftsWithBlanks.length > 0 || nextAction
          ? "\nWant me to help with any of that, or is there something else on your mind?"
          : "\nWhat would you like to do? We can talk anything through, or I can start drafting."
      );

      setMessages([{ role: "assistant", content: lines.join("\n") }]);
    })();
    return () => {
      cancelled = true;
    };
  }, [urlCaseFileId, isQuickConsult]);

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

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
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
      // No case file yet — queue the doc. It will be uploaded automatically as
      // soon as the user sends their first message and a case file is created.
      setQueuedDocFiles((prev) => [...prev, file]);
      setDocUploads((prev) => [
        ...prev,
        { key: `${file.name}-queued-${Date.now()}`, fileName: file.name || "document", status: "uploading" },
      ]);
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

  async function sendMessage(e: FormEvent | null, overrideText?: string) {
    e?.preventDefault();
    const text = (overrideText ?? input).trim();
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

        setStreamingText(stripToolMarkers(full));
        setActiveTools(activeToolNames(full));
      }

      // Detect structured truncation sentinel emitted by the server
      const TRUNC_SENTINEL = "\x01TRUNCATED\x01";
      if (full.endsWith(TRUNC_SENTINEL)) {
        full = full.slice(0, -TRUNC_SENTINEL.length);
        setChatTruncated(true);
      } else {
        setChatTruncated(false);
      }
      setActiveTools([]);
      // open_uploaded_document creates a panel draft server-side (no ---DRAFT---
      // block in the text), so detect its tool marker before we strip markers.
      const openedUpload = /\x02TOOL:open_uploaded_document:done\x02/.test(full);
      // Strip the transient tool markers before the message is stored.
      full = stripToolMarkers(full);
      setMessages((prev) => [...prev, { role: "assistant", content: full }]);
      setStreamingText("");
      // The server persisted any ---DRAFT--- blocks (or opened an uploaded doc as a
      // draft via the tool); open the panel and refresh it.
      const newDrafts = parseDrafts(full);
      if (mode === "freestyle" && (newDrafts.length > 0 || openedUpload)) {
        setDraftsPanelOpen(true);
        setDraftsRefresh((n) => n + 1);
        // Show a notification banner so it's clear where the draft went.
        if (newDrafts.length > 0) setDraftSavedTitle(newDrafts[0].title);
      }
      setPendingCounselContext(null);
      // Resolved doc uploads are now in the file context; keep only in-flight ones.
      setDocUploads((prev) => prev.filter((d) => d.status === "uploading"));
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I'm sorry — something went wrong. Please try again." },
      ]);
      setStreamingText("");
      setActiveTools([]);
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

        <div className="fc-topbar-center" />

        <div className="fc-topbar-right">
          {mode === "freestyle" && caseFileId && !isQuickConsult && (
            <button
              type="button"
              className={`fc-upgrade-btn fc-drafts-btn${draftCount > 0 && !draftsPanelOpen ? " fc-drafts-btn-has" : ""}`}
              style={{
                background: draftsPanelOpen ? "var(--brand-gold)" : undefined,
                color: draftsPanelOpen ? "#1a1206" : undefined,
              }}
              onClick={() => { setDraftsPanelOpen((v) => !v); setDraftSavedTitle(null); }}
              title="Show or hide your drafts"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              {draftsPanelOpen ? "Hide drafts" : "Drafts"}
              {draftCount > 0 && <span className="fc-drafts-badge">{draftCount}</span>}
            </button>
          )}
          {isQuickConsult && hasUserMessages ? (
            <button
              className="fc-upgrade-btn"
              style={{ background: "rgba(154,118,54,0.12)", color: "var(--chat-gold-ink, #9a7636)" }}
              onClick={() => isQuickConsult && hasUserMessages ? setShowQcModal(true) : router.push(caseHomeHref)}
            >
              Save to a case file
            </button>
          ) : (
            <button
              className="fc-upgrade-btn"
              style={{ background: "rgba(12,25,41,0.06)", color: "var(--brand-navy)" }}
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
          <AccountMenu onLight />
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
        <div className="fc-disclaimer" style={{ color: "var(--chat-gold-ink, #9a7636)", borderColor: "rgba(154,118,54,0.2)" }}>
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

      {/* FREESTYLE WORKSPACE SPLIT — chat column on the left, drafts docked right */}
      <div className={`fc-workspace-row${mode === "freestyle" && draftsPanelOpen ? " fc-workspace-row-split" : ""}`}>
      <div className="fc-workspace-main">

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
              {msg.role === "assistant" ? (
                renderContent(msg.content, (title) => openDraft({ title }))
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
              {renderContent(streamingText, (title) => openDraft({ title }))}
              <ToolRunChips tools={activeTools} />
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
              {activeTools.length > 0 ? <ToolRunChips tools={activeTools} /> : <><span /><span /><span /></>}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      <div
        ref={inputAreaRef}
        className={`fc-input-area${dragOver ? " fc-input-area-dragover" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* "Draft saved" notification — appears after AI produces a draft, clears when
            the user opens the panel or dismisses it manually. */}
        {draftSavedTitle && !draftsPanelOpen && (
          <div className="fc-draft-notify">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="fc-draft-notify-text">
              Draft saved: <strong>{draftSavedTitle}</strong>
            </span>
            <button
              type="button"
              className="fc-draft-notify-open"
              onClick={() => { setDraftsPanelOpen(true); setDraftSavedTitle(null); }}
            >
              Open Drafts →
            </button>
            <button
              type="button"
              className="fc-draft-notify-dismiss"
              onClick={() => setDraftSavedTitle(null)}
              aria-label="Dismiss"
            >×</button>
          </div>
        )}

        {/* Document uploads (freestyle) — added to the file + analyzed, not sent inline */}
        {docUploads.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {docUploads.map((d) => (
              <span
                key={d.key}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 10px", borderRadius: 999, fontSize: 12,
                  background: d.status === "error" ? "rgba(192,57,43,0.07)" : "rgba(154,118,54,0.08)",
                  border: `1px solid ${d.status === "error" ? "rgba(192,57,43,0.4)" : "rgba(154,118,54,0.28)"}`,
                  color: d.status === "error" ? "#7f1d1d" : "var(--brand-text-md)",
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

        {hasUserMessages && !loading && (
          <div className="fc-quickrow">
            <button
              type="button"
              className="fc-quickchip fc-quickchip-draft"
              onClick={() => sendMessage(null, "Draft the document we've been discussing. Use what's already in my file, put clearly-marked placeholders where you're missing something, and then tell me exactly what you need from me to fill those in. If it's not obvious what to draft, ask me first.")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              Draft a document
            </button>
            <button
              type="button"
              className="fc-quickchip"
              onClick={() => sendMessage(null, "Just give me your bottom line with what you know so far — I'd rather not go through more questions right now.")}
            >
              Just give me the bottom line
            </button>
          </div>
        )}

        {/* Hidden file input — triggered by the paperclip button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,text/markdown,text/csv,application/rtf,text/rtf"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) attachFile(file);
            e.target.value = "";
          }}
        />
        <form className="fc-input-form" onSubmit={sendMessage}>
          <button
            type="button"
            className="fc-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            aria-label="Attach file"
            title="Attach image, PDF, or document"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            className="fc-textarea"
            placeholder={
              dragOver
                ? "Drop file here…"
                : mode === "freestyle"
                  ? "Ask anything, or attach a document to work from…"
                  : "Share details of your situation… or paste a screenshot"
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
          Attach images, PDFs, or Word docs
        </p>
        <VoiceUnsupportedNote />
      </div>

      </div>{/* /fc-workspace-main */}
      {mode === "freestyle" && draftsPanelOpen && caseFileId && (
        <ChatDraftsPanel
          caseFileId={caseFileId}
          refreshKey={draftsRefresh}
          focusId={draftFocus.id}
          focusTitle={draftFocus.title}
          focusNonce={draftFocus.nonce}
          onClose={() => setDraftsPanelOpen(false)}
        />
      )}
      </div>{/* /fc-workspace-row */}
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
