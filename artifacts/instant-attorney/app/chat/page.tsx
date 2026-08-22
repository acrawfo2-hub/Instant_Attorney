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
import ChatStandingRail from "@/components/ChatStandingRail";
import { phase2ExistingCounselNotice } from "@/lib/existing-counsel";
import { parseDrafts, stripDraftsForDisplay } from "@/lib/freestyle-drafts";
import { stripToolMarkers, activeToolNames } from "@/lib/tool-markers";
import { placeholderFields } from "@/lib/placeholder-parsing";
import { computeDocket, describePressingDeadline } from "@/lib/docket";
import ToolRunChips from "@/components/ToolRunChips";
import ChatMatterPicker from "@/components/ChatMatterPicker";
import type { CounselEngagementGoal } from "@/lib/types";

type Msg = Pick<IntakeMessage, "role" | "content"> & {
  // Local-only: object URL for a screenshot the user attached to this turn, so the
  // image stays visible in the chat history instead of collapsing to a [filename] tag.
  imageUrl?: string;
  // Local-only: placeholder for a turn still generating in the background. It
  // renders as nothing and is replaced in place when the reply arrives, so the
  // reply lands BEFORE any messages the user sent afterwards.
  pendingId?: string;
};

interface PendingAttachment {
  data: string;    // base64
  mimeType: string;
  fileName: string;
  previewUrl: string;
}

interface DocUpload {
  id: string;
  file: File;
  status: "queued" | "uploading" | "ready" | "error";
}

const INITIAL_MESSAGE: Msg = {
  role: "assistant",
  content:
    "Welcome — this is your private case conversation. Everything you share here is confidential and protected by attorney-client privilege.\n\nI'll help build your case file as we talk. Share as much or as little as you're comfortable with right now.\n\nWhat's going on? Tell me about your situation.",
};

const MAX_INLINE_BYTES = 4 * 1024 * 1024; // 4 MB for inline screenshots (intake)
const MAX_FREESTYLE_BYTES = 10 * 1024 * 1024; // 10 MB for freestyle document attachments
const MAX_FREESTYLE_MB = MAX_FREESTYLE_BYTES / (1024 * 1024);

// Freestyle accepts documents too, not just screenshots — the chat-acp backend
// already turns PDFs, Word docs, and text files into Anthropic content blocks.
const FREESTYLE_ATTACH_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain", "text/markdown", "text/csv", "text/html",
  "application/json", "application/rtf", "text/rtf",
]);

function renderContent(text: string, onOpenDraft?: (title: string) => void, persistedDrafts: Record<string, string> = {}) {
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
    const persistedId = persistedDrafts[d.title];
    if (!persistedId) continue;
    elements.push(
      <button
        key={`draft-${d.title}`}
        type="button"
        className="fc-draft-note fc-draft-note-btn"
        onClick={onOpenDraft ? () => onOpenDraft(persistedId) : undefined}
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
  const isNewCase = searchParams.get("newCase") === "1" && !urlCaseFileId;
  // `?ask=` seeds the composer from the file's next-step button and starter
  // chips. Deliberately NOT auto-sent: the client should see the question, be
  // able to change it, and press send herself — the file suggests, she asks.
  const urlAsk = searchParams.get("ask");

  const [messages, setMessages] = useState<Msg[]>([INITIAL_MESSAGE]);
  // One conversation, no mode toggle: the assistant is the orchestrator and paces
  // itself (a focused question when it needs a fact, open when you want to think).
  // It always runs in the tools-enabled "freestyle" behavior.
  const mode: ChatMode = "freestyle";
  const [caseFileId, setCaseFileId] = useState<string | null>(urlCaseFileId);
  const [input, setInput] = useState(urlAsk ?? "");
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
  const [dragOver, setDragOver] = useState(false);
  // When the AI saves a new draft, show a dismissible banner so users know where it went.
  const [draftSavedTitle, setDraftSavedTitle] = useState<string | null>(null);
  const [persistedDrafts, setPersistedDrafts] = useState<Record<string, string>>({});
  const [draftRecovery, setDraftRecovery] = useState<{ jobId: string; titles: string[]; saving: boolean } | null>(null);
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
  // Background turns: a long generation (e.g. a document draft) keeps running
  // server-side after the client lets go of its stream. Each entry is polled
  // via /api/chat-acp/status until the finished text can be placed into the
  // transcript. pendingId anchors the reply to a placeholder message (stable
  // even as more messages arrive); null means append at the end.
  const [bgJobs, setBgJobs] = useState<Array<{ jobId: string; pendingId: string | null; startedAt: number; sequence?: number }>>([]);
  const bgJobsRef = useRef(bgJobs);
  const currentJobIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendSeqRef = useRef(0);
  // Scroll pinning: only auto-follow new output while the user is at the
  // bottom of the transcript. Scrolling up stops the auto-scroll (so long
  // generations can be read through) until they jump back down.
  const messagesMainRef = useRef<HTMLElement>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  const caseFileIdRef = useRef<string | null>(caseFileId);
  const hasUserMessages = messages.some((m) => m.role === "user");
  const caseHomeHref = caseFileId ? `/dashboard/${caseFileId}` : "/dashboard";

  useEffect(() => { bgJobsRef.current = bgJobs; }, [bgJobs]);

  // Arriving from a file button with `?ask=`: put the cursor in the composer,
  // sized to the seeded text, so the only thing left to do is press send.
  useEffect(() => {
    const el = textareaRef.current;
    if (!urlAsk || !el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // Mount-only: re-running would yank focus back mid-conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pinnedRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingText]);

  function handleMessagesScroll() {
    const el = messagesMainRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinnedRef.current = pinned;
    setShowJump(!pinned);
  }

  function jumpToLatest() {
    pinnedRef.current = true;
    setShowJump(false);
    // Scroll the container directly (instant) so the scroll event that fires
    // during animation cannot flip pinnedRef back to false before we arrive.
    const el = messagesMainRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }

  // Durable case-level discovery deliberately keeps polling after each
  // completion: this attaches the next queued turn and delivers every
  // unacknowledged reply in its original sequence after reload/restart.
  useEffect(() => {
    if (!urlCaseFileId) return;
    let cancelled = false;
    type DurableJob = { jobId: string; sequence: number; state: string; running?: boolean; startedAt: number; finalText?: string | null; truncated?: boolean; error?: string | null; draftPersistence?: { persisted: Array<{ id: string; title: string }>; failed: Array<{ title: string }> } | null };
    const resolveJob = (job: DurableJob) => {
      if (job.truncated) setChatTruncated(true);
      const raw = typeof job.finalText === "string" ? job.finalText : "";
      const text = stripToolMarkers(raw).trim();
      const persistence = job.draftPersistence;
      if (persistence) {
        setPersistedDrafts((prev) => ({ ...prev, ...Object.fromEntries(persistence.persisted.map((d) => [d.title, d.id])) }));
        if (persistence.persisted.length) setDraftSavedTitle(persistence.persisted[0].title);
        setDraftRecovery(persistence.failed.length ? { jobId: job.jobId, titles: persistence.failed.map((d) => d.title), saving: false } : null);
      }
      setMessages((prev) => {
        const tracked = bgJobsRef.current.find((j) => j.jobId === job.jobId);
        if (tracked?.pendingId) {
          const idx = prev.findIndex((m) => m.pendingId === tracked.pendingId);
          if (idx !== -1) {
            const next = [...prev];
            if (text) next[idx] = { role: "assistant", content: text };
            else next.splice(idx, 1);
            return next;
          }
        }
        // Hydration may already have loaded the linked intake message.
        return text && !prev.some((m) => m.role === "assistant" && m.content.trim() === text)
          ? [...prev, { role: "assistant", content: text }] : prev;
      });
      if (text) {
        const newDrafts = parseDrafts(raw);
        const openedUpload = /\x02TOOL:open_uploaded_document:done\x02/.test(raw);
        if (newDrafts.length > 0 || openedUpload || /---DOCUMENT PLAN---/.test(raw)) {
          setDraftsPanelOpen(true);
          setDraftsRefresh((n) => n + 1);
        }
      } else {
        setDraftsRefresh((n) => n + 1);
      }
      // #107 called setError here, which this page has never defined — the
      // reason it failed to compile. Errors surface in the transcript, the same
      // channel the reply would have used, so a failed turn is visible where
      // the user is already looking rather than silently dropped.
      if (job.error) {
        setMessages((prev) => prev.some((m) => m.role === "assistant" && m.content === job.error)
          ? prev
          : [...prev, { role: "assistant", content: job.error! }]);
      }
    };

    const tick = async () => {
      try {
        const res = await fetch(`/api/chat-acp/status?caseFileId=${encodeURIComponent(urlCaseFileId)}`);
        if (!res.ok) return;
        const data = await res.json() as { jobs?: DurableJob[] };
        if (cancelled) return;
        const jobs = data.jobs ?? [];
        setBgJobs((prev) => jobs.filter((j) => j.running).map((j) => ({
          jobId: j.jobId, sequence: j.sequence, startedAt: j.startedAt,
          pendingId: prev.find((p) => p.jobId === j.jobId)?.pendingId ?? null,
        })));
        const completed: DurableJob[] = [];
        // Do not advance the cursor across an unfinished predecessor: doing so
        // could hide its later reply and would display successors out of order.
        for (const job of [...jobs].sort((a, b) => a.sequence - b.sequence)) {
          if (job.running) break;
          completed.push(job);
        }
        for (const job of completed) resolveJob(job);
        if (completed.length) {
          await fetch("/api/chat-acp/status", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caseFileId: urlCaseFileId, sequence: completed.at(-1)!.sequence }) });
        }
      } catch { /* transient network error — retry */ }
    };

    const t = setInterval(tick, 4000);
    tick();
    return () => { cancelled = true; clearInterval(t); };
  // bgJobs is intentionally read from the interval closure only to preserve
  // local placeholder anchors; case discovery owns subsequent polling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCaseFileId]);

  // Keep the draft count badge on the Drafts button current.
  useEffect(() => {
    if (!caseFileId) return;
    fetch(`/api/workspace/drafts?caseFileId=${caseFileId}`)
      .then((r) => r.ok ? r.json() : { drafts: [] })
      .then((d) => setDraftCount((d.drafts ?? []).length))
      .catch(() => {});
  }, [caseFileId, draftsRefresh]);

  const uploadDoc = useCallback(async (id: string, file: File, targetCaseFileId: string) => {
    setDocUploads((prev) => prev.map((doc) => (
      doc.id === id ? { ...doc, status: "uploading" } : doc
    )));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("caseFileId", targetCaseFileId);
      const res = await fetch("/api/attachments/upload", { method: "POST", body: fd });
      if (!res.ok) {
        throw new Error(res.status === 413 ? "File is too large to upload." : "Upload failed.");
      }
      setDocUploads((prev) => prev.map((doc) => (
        doc.id === id ? { ...doc, status: "ready" } : doc
      )));
    } catch (err) {
      setDocUploads((prev) => prev.map((doc) => (
        doc.id === id ? { ...doc, status: "error" } : doc
      )));
      throw err;
    }
  }, []);

  // When caseFileId becomes available (first message sent), transition the
  // existing queued records in place. Their IDs and File objects stay stable.
  useEffect(() => {
    if (!caseFileId) return;
    const queued = docUploads.filter((doc) => doc.status === "queued");
    if (queued.length === 0) return;

    // Claim every queued record before starting network work. This prevents a
    // subsequent render (including React Strict Mode's extra effect pass) from
    // scheduling the same upload twice.
    setDocUploads((prev) => prev.map((doc) => (
      doc.status === "queued" ? { ...doc, status: "uploading" } : doc
    )));
    queued.forEach((doc) => {
      void uploadDoc(doc.id, doc.file, caseFileId).catch(() => {});
    });
  }, [caseFileId, docUploads, uploadDoc]);

  // Put a suggested question in the composer and focus it. Never auto-sends: the
  // client reads and edits before it costs her a turn.
  const askInComposer = useCallback((text: string) => {
    setInput(text);
    const el = textareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

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

      // Fetch case-file metadata, pending drafts, and facts (for the computed
      // docket) in parallel
      const [cfRes, docsRes, factsRes] = await Promise.all([
        supabase
          .from("case_files")
          .select("chat_session_summary, next_action, jurisdiction")
          .eq("id", urlCaseFileId)
          .maybeSingle(),
        supabase
          .from("documents")
          .select("title, draft_text, status")
          .eq("case_file_id", urlCaseFileId)
          .in("status", ["draft", "pending_review"]),
        supabase
          .from("fact_items")
          .select("id, description, status, kind")
          .eq("case_file_id", urlCaseFileId),
      ]);

      if (cancelled) return;

      const cf = cfRes.data as { chat_session_summary: string | null; next_action: string | null; jurisdiction: string | null } | null;
      const docs = (docsRes.data ?? []) as { title: string; draft_text: string | null; status: string }[];

      const recap = cf?.chat_session_summary?.trim() || null;
      const nextAction = cf?.next_action?.trim() || null;

      // An imminent or passed deadline outranks everything — name it first.
      const factRows = (factsRes.data ?? []) as { id: string; description: string; status: string; kind?: string }[];
      const deadlineAlert = describePressingDeadline(
        computeDocket(factRows, new Date(), cf?.jurisdiction ?? null)
      );

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

      if (deadlineAlert) {
        lines.push(`${deadlineAlert}\n`);
      }

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
      alert(`Attachments must be under ${MAX_FREESTYLE_MB} MB. For larger files, use the Upload Documents section on your dashboard.`);
      return;
    }
    const uploadId = crypto.randomUUID();
    const upload: DocUpload = { id: uploadId, file, status: caseFileIdRef.current ? "uploading" : "queued" };
    setDocUploads((prev) => [...prev, upload]);
    const targetCaseFileId = caseFileIdRef.current;
    if (!targetCaseFileId) {
      // No case file yet — queue the doc. It will be uploaded automatically as
      // soon as the user sends their first message and a case file is created.
      return;
    }
    try {
      await uploadDoc(upload.id, file, targetCaseFileId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed.");
    }
  }, [mode, uploadDoc]);

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
    if ((!text && !pendingAttachment) || showCounselModal) return;

    // Sending while a turn is still generating moves that turn to the
    // background: let go of its stream (the server keeps generating and
    // persists everything), leave a placeholder where its reply belongs, and
    // continue with the new message. The server serializes turns per case file
    // and splices the finished reply into the model history; the poll above
    // fills the placeholder when it completes.
    let bgPlaceholderId: string | null = null;
    if (loading) {
      const prevJobId = currentJobIdRef.current;
      // Header (with the job id) hasn't arrived yet — without it the turn
      // can't be recovered, so hold the send for a beat instead of losing it.
      if (!prevJobId) return;
      abortRef.current?.abort();
      bgPlaceholderId = `bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setBgJobs((prev) => [
        ...prev,
        { jobId: prevJobId, pendingId: bgPlaceholderId, startedAt: Date.now() },
      ]);
      setStreamingText("");
      setActiveTools([]);
    }

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
    const nextMessages: Msg[] = bgPlaceholderId
      ? [...messages, { role: "assistant", content: "", pendingId: bgPlaceholderId }, userMsg]
      : [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setStreamingText("");
    pinnedRef.current = true;
    setShowJump(false);
    // This turn's job id arrives in the response header frame.
    currentJobIdRef.current = null;
    const seq = ++sendSeqRef.current;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Hand the object URL off to the sent message so it stays visible in history.
    // Do NOT revoke it here (clearAttachment would) — the message bubble now owns it.
    setPendingAttachment(null);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      // For API, use plain text content (not the display content with filename
      // prefix). Background placeholders are local-only — exclude them; the
      // server splices the real previous reply into the model history itself.
      const apiMessages = nextMessages
        .filter((m) => !m.pendingId)
        .map((m, idx, arr) => ({
          role: m.role,
          content: idx === arr.length - 1 ? text : m.content,
        }));

      const res = await fetch("/api/chat-acp", {
        method: "POST",
        signal: ctrl.signal,
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
            // Header frame: "<caseFileId>|<jobId>". The job id lets us
            // re-attach to this turn via the status endpoint if we let go of
            // the stream (user sent another message mid-generation).
            const header = chunk.slice(1, end);
            const [id, jobId] = header.split("|");
            currentJobIdRef.current = jobId || null;
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
      let confirmedDraftCount = 0;
      const completedJobId = currentJobIdRef.current;
      if (completedJobId) {
        const statusRes = await fetch(`/api/chat-acp/status?jobId=${encodeURIComponent(completedJobId)}`);
        if (statusRes.ok) {
          const status = await statusRes.json() as { draftPersistence?: { persisted: Array<{ id: string; title: string }>; failed: Array<{ title: string }> } };
          const persistence = status.draftPersistence;
          if (persistence) {
            confirmedDraftCount = persistence.persisted.length;
            setPersistedDrafts((prev) => ({ ...prev, ...Object.fromEntries(persistence.persisted.map((d) => [d.title, d.id])) }));
            if (persistence.persisted.length) setDraftSavedTitle(persistence.persisted[0].title);
            setDraftRecovery(persistence.failed.length ? { jobId: completedJobId, titles: persistence.failed.map((d) => d.title), saving: false } : null);
          }
        }
      }
      if (mode === "freestyle" && (confirmedDraftCount > 0 || openedUpload || /---DOCUMENT PLAN---/.test(full))) {
        setDraftsPanelOpen(true);
        setDraftsRefresh((n) => n + 1);
      }
      setPendingCounselContext(null);
      // Resolved doc uploads are now in the file context; keep only in-flight ones.
      setDocUploads((prev) => prev.filter((d) => d.status === "uploading"));
    } catch {
      // Aborted on purpose (the turn moved to the background) — not an error.
      if (!ctrl.signal.aborted) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "I'm sorry — something went wrong. Please try again." },
        ]);
        setStreamingText("");
        setActiveTools([]);
      }
    } finally {
      // Only the most recent send owns the loading flag — an older, aborted
      // turn finishing up must not clear the newer turn's state.
      if (sendSeqRef.current === seq) setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as unknown as FormEvent);
    }
  }

  async function saveDraftsAgain() {
    if (!draftRecovery || draftRecovery.saving) return;
    setDraftRecovery({ ...draftRecovery, saving: true });
    try {
      const res = await fetch("/api/chat-acp/status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: draftRecovery.jobId }),
      });
      if (!res.ok) throw new Error("Save retry failed");
      const data = await res.json() as { draftPersistence: { persisted: Array<{ id: string; title: string }>; failed: Array<{ title: string }> } };
      setPersistedDrafts((prev) => ({ ...prev, ...Object.fromEntries(data.draftPersistence.persisted.map((d) => [d.title, d.id])) }));
      if (data.draftPersistence.persisted.length) {
        setDraftSavedTitle(data.draftPersistence.persisted.at(-1)?.title ?? null);
        setDraftsRefresh((n) => n + 1);
      }
      setDraftRecovery(data.draftPersistence.failed.length ? {
        jobId: draftRecovery.jobId, titles: data.draftPersistence.failed.map((d) => d.title), saving: false,
      } : null);
    } catch {
      setDraftRecovery((current) => current ? { ...current, saving: false } : current);
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
              className="fc-upgrade-btn fc-case-home-btn"
              onClick={() => isQuickConsult && hasUserMessages ? setShowQcModal(true) : router.push(caseHomeHref)}
              title={isQuickConsult ? "All cases" : "Go to your case homepage"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              {isQuickConsult || (isNewCase && !caseFileId) ? "All cases" : "Your case file"}
            </button>
          )}
          <AccountMenu onLight />
        </div>
      </header>

      {isNewCase && !caseFileId && (
        <div className="fc-new-case-banner" role="status">
          <strong>New case</strong>
          <span>This conversation starts a separate private file. It will not change your existing cases.</span>
        </div>
      )}

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

      {/* WHERE WE STAND — pinned outside the transcript's scroll container, so a
          long answer can never bury it, with every open item actionable here. */}
      {mode === "freestyle" && caseFileId && !isQuickConsult && (
        <ChatStandingRail
          caseFileId={caseFileId}
          refreshKey={messages.length + draftsRefresh}
          onAsk={askInComposer}
          onOpenDraft={(id) => openDraft({ id })}
          onAttach={() => fileInputRef.current?.click()}
        />
      )}

      {/* MESSAGES */}
      <main className="fc-messages" ref={messagesMainRef} onScroll={handleMessagesScroll}>
        {messages.map((msg, i) => msg.pendingId ? null : (
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
                renderContent(msg.content, (id) => openDraft({ id }), persistedDrafts)
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

        {/* Background turn progress card — a long generation keeps running
            server-side; the user can keep chatting or leave this page. */}
        {bgJobs.length > 0 && (
          <div className="fc-msg-row fc-msg-row-ai">
            <div className="fc-avatar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="fc-bubble fc-bubble-ai" role="status">
              <p><strong>Still working on that in the background…</strong></p>
              <p>
                Long drafts can take a few minutes. You can keep chatting or leave this
                page — anything I draft is saved to your <strong>Drafts</strong> automatically,
                and the reply will appear here when it&apos;s ready.
              </p>
            </div>
          </div>
        )}

        {showJump && (
          <button
            type="button"
            onClick={jumpToLatest}
            aria-label="Jump to latest messages"
            style={{
              position: "sticky",
              bottom: 8,
              alignSelf: "center",
              zIndex: 5,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
            Jump to latest
          </button>
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
        {draftRecovery && (
          <div className="fc-draft-notify" role="alert">
            <span className="fc-draft-notify-text">
              Your generated {draftRecovery.titles.length === 1 ? "draft is" : "drafts are"} safe in this recovery job, but could not be saved yet.
            </span>
            <button type="button" className="fc-draft-notify-open" onClick={saveDraftsAgain} disabled={draftRecovery.saving}>
              {draftRecovery.saving ? "Saving…" : "Save again"}
            </button>
          </div>
        )}

        {/* Document uploads (freestyle) — added to the file + analyzed, not sent inline */}
        {docUploads.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {docUploads.map((d) => (
              <span
                key={d.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 10px", borderRadius: 999, fontSize: 12,
                  background: d.status === "error" ? "rgba(192,57,43,0.07)" : "rgba(154,118,54,0.08)",
                  border: `1px solid ${d.status === "error" ? "rgba(192,57,43,0.4)" : "rgba(154,118,54,0.28)"}`,
                  color: d.status === "error" ? "#7f1d1d" : "var(--brand-text-md)",
                }}
              >
                <span aria-hidden>{d.status === "error" ? "⚠" : "📄"}</span>
                {d.file.name || "document"}
                <span style={{ opacity: 0.6 }}>
                  {d.status === "queued"
                    ? "· Waiting until your case is created"
                    : d.status === "uploading"
                      ? "· adding…"
                      : d.status === "ready"
                        ? "· added to your file"
                        : "· failed"}
                </span>
                {d.status === "error" && caseFileId && (
                  <button
                    type="button"
                    onClick={() => void uploadDoc(d.id, d.file, caseFileId).catch((err) => {
                      alert(err instanceof Error ? err.message : "Upload failed.");
                    })}
                    aria-label={`Retry uploading ${d.file.name || "document"}`}
                    style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={() => setDocUploads((prev) => prev.filter((x) => x.id !== d.id))}
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
          <ChatMatterPicker currentId={caseFileId} hasMessages={hasUserMessages} />
          <button
            type="button"
            className="fc-attach-btn"
            onClick={() => fileInputRef.current?.click()}
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
          />
          <VoiceInputButton
            onTranscript={(t) => {
              setInput((v) => (v.trim() ? `${v.trim()} ${t}` : t));
              requestAnimationFrame(autoResize);
            }}
          />
          <button
            type="submit"
            className="fc-send-btn"
            disabled={!input.trim() && !pendingAttachment}
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
