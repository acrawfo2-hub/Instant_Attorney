"use client";

import { useState, useRef, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReviewSlaClock from "@/components/ReviewSlaClock";
import VoiceInputButton from "@/components/VoiceInputButton";
import { WIZARD_LABELS } from "@/lib/types";
import type { WizardType } from "@/lib/types";
import {
  parseDrafterResponse,
  buildNeededItems,
  buildFallbackTemplate,
  deriveQuestionsFromTemplate,
  ensureChecklistNeeds,
  buildBundledMessage,
  buildStarterItems,
  mapAnswersToPlaceholders,
} from "@/lib/wizard-parsing";
import type { ParsedDrafter, NeededItem, LabeledAnswer } from "@/lib/wizard-parsing";
import { mergeStagedStarter, drainStagedStarter } from "@/lib/starter-fold";

// Keep just under the server route's maxDuration (300s) so a long but legitimate
// draft finishes server-side instead of being aborted by the client. If the
// client does give up, the draft is still saved server-side and recovered via the
// /api/documents/lookup path on the next visit.
const WIZARD_TIMEOUT_MS = 290_000; // ~4.8 min — legal docs can be long

interface Message {
  role: "user" | "assistant";
  content: string;
}

// Append dictated text to whatever the client has already typed in a field, so
// voice is purely additive (and they can still edit before sending).
function appendDictation(existing: string | undefined, dictated: string): string {
  const base = existing?.trim() ?? "";
  return base ? `${base} ${dictated}` : dictated;
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

export default function WizardPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseFileId = searchParams.get("caseFileId") ?? "";
  // A specific document to resume (an in-progress "draft" or a "changes_requested"
  // doc linked from the dashboard). Not used for any background pre-generation —
  // the draft is always composed live when the wizard opens.
  const resumeDocId = searchParams.get("docId") ?? "";

  const wizardType = type as WizardType;
  const instrumentParam = searchParams.get("instrument") ?? "";
  // For general_document, use the specific instrument name as the display label
  const label = (wizardType === "general_document" && instrumentParam)
    ? instrumentParam
    : (WIZARD_LABELS[wizardType] ?? wizardType);

  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [parsed, setParsed] = useState<ParsedDrafter | null>(null);
  const [documentId, setDocumentId] = useState<string>(resumeDocId);
  const [downloading, setDownloading] = useState(false);
  const [submittedForReview, setSubmittedForReview] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Attorney-users draft for their own clients and are the reviewing attorney
  // themselves — they never submit into Andrew Crawford's review queue.
  const [isAttorneyUser, setIsAttorneyUser] = useState(false);
  // Free-form "ask for a change" chat, available once a draft exists — this is
  // the only way to keep editing once the checklist has no remaining blanks.
  const [chatInput, setChatInput] = useState("");
  const didInitRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetch("/api/account/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.account_type === "attorney_user") setIsAttorneyUser(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Guided checklist: per-field answers + "anything else" note + update feedback
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [extraNote, setExtraNote] = useState("");
  const [justUpdated, setJustUpdated] = useState(false);
  const [truncatedDraft, setTruncatedDraft] = useState(false);
  const [gapSyncWarning, setGapSyncWarning] = useState(false);

  // Pre-draft "starter questions": surfaced immediately while the first draft is
  // generated live in the background, so the client can answer during the wait.
  // Their answers are saved as facts right away and folded into the draft once it
  // lands — this NEVER interrupts the in-flight document build, and any question
  // left blank simply stays a highlighted placeholder for the attorney to finish.
  const [starterItems, setStarterItems] = useState<NeededItem[]>([]);
  const [starterSaved, setStarterSaved] = useState(false);
  // Document Review needs a real uploaded document; when none exists this gates
  // generation and shows an "upload first" screen instead of drafting.
  const [docReviewGated, setDocReviewGated] = useState(false);
  // Improve My Draft needs the client's own uploaded document as the base to
  // improve. Gates generation until one is picked or uploaded inline.
  const [improveDraftGated, setImproveDraftGated] = useState(false);
  const [existingDraftAttachments, setExistingDraftAttachments] = useState<{ id: string; file_name: string }[]>([]);
  const [improveUploading, setImproveUploading] = useState(false);
  const [improveUploadError, setImproveUploadError] = useState("");
  const [improveDragOver, setImproveDragOver] = useState(false);
  // The attachment id feeding the current "Improve My Draft" generation. A ref
  // (not state) because runDrafter's fetch body reads it synchronously.
  const baseAttachmentIdRef = useRef<string>("");
  const improveFileInputRef = useRef<HTMLInputElement>(null);
  // Staged starter answers to fold in once the first draft is ready: those that
  // map to a unique placeholder are filled deterministically; the rest go to one
  // model refine pass. Captured at save time because runDrafter clears the form.
  const pendingStarterRef = useRef<{ filled: LabeledAnswer[]; note: string } | null>(null);
  // Freshest assistant draft text — used to build the fold refine-pass history
  // without depending on async `messages` state.
  const lastAssistantRef = useRef<string>("");

  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  // A synchronous mirror of the saved document id. State updates are async, so
  // right after a generation finishes the `documentId` state is still stale
  // inside the same handler that needs to auto-send the draft to the attorney —
  // this ref always holds the freshest id.
  const docIdRef = useRef<string>(resumeDocId);

  // Elapsed-seconds ticker while streaming
  useEffect(() => {
    if (!streaming) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [streaming]);

  useEffect(() => {
    // Synchronous ref guard (not state): React strict mode double-invokes this
    // effect in dev before a state update would be visible, which previously ran
    // initializeDraft() twice. The second runDrafter() aborts the first's fetch,
    // surfacing a spurious "Drafting took too long" error on mount. A ref is set
    // synchronously and persists across the simulated remount, so init runs once.
    if (didInitRef.current) return;
    didInitRef.current = true;
    initializeDraft();
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
    lastAssistantRef.current = fakeResponse;
    setDocumentId(doc.id);
    docIdRef.current = doc.id;
    if (doc.status === "pending_review") {
      setSubmittedForReview(true);
      setSubmittedAt(doc.submitted_at ?? null);
    }
  }

  async function initializeDraft() {
    // 1) A specific document to resume was linked (an in-progress "draft" or a
    //    "changes_requested" doc from the dashboard). Load it as-is.
    if (resumeDocId) {
      try {
        const res = await fetch(`/api/documents/${resumeDocId}`);
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

    // 2) Resume an existing in-progress draft for this case + type, if one was
    //    started earlier (e.g. the tab was closed mid-generation).
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

    // 2b) Document Review only makes sense against a document the client actually
    //     uploaded. If none exists yet, gate generation and prompt for an upload
    //     instead of reviewing an empty Living File. (Resuming an existing
    //     doc_review draft above is unaffected — that document already exists.)
    if (wizardType === "doc_review" && caseFileId) {
      try {
        const res = await fetch(`/api/attachments?caseFileId=${encodeURIComponent(caseFileId)}`);
        if (res.ok) {
          const data = await res.json();
          if (!data.attachments?.length) {
            setDocReviewGated(true);
            return;
          }
        }
      } catch {
        // If the check fails, fall through to normal generation rather than blocking.
      }
    }

    // 2c) Improve My Draft needs the client's own uploaded document as the base
    //     to improve. Gate generation and let them pick an existing upload or
    //     add a new one inline — never draft from a blank page for this type.
    if (wizardType === "improve_draft" && caseFileId) {
      try {
        const res = await fetch(`/api/attachments?caseFileId=${encodeURIComponent(caseFileId)}`);
        if (res.ok) {
          const data = await res.json();
          const docs = ((data.attachments ?? []) as { id: string; file_name: string; status: string; attachment_type: string }[])
            .filter((a) => a.status === "ready" && a.attachment_type !== "screenshot");
          setExistingDraftAttachments(docs);
        }
      } catch {
        // If the lookup fails, the uploader is still shown — just no quick picks.
      }
      setImproveDraftGated(true);
      return;
    }

    // 3) Generate the draft live now, and surface starter questions immediately so
    //    the client can answer during the wait instead of staring at a loader.
    //    The draft is always produced (with [[placeholders]] for anything still
    //    unknown) regardless of how many questions get answered.
    showStarterQuestions();
    await runDrafter([], true);
    await maybeFoldStarterAnswers();
  }

  // Build the document-type-aware starter questions (no AI call needed), so the
  // client sees relevant questions — names, addresses, timelines, governing law,
  // etc. — within a moment of arriving while the real draft is still composing.
  function showStarterQuestions() {
    setStarterItems(buildStarterItems(wizardType));
  }

  // Replace the on-screen draft with a server-returned plain draft (e.g. after a
  // deterministic placeholder fill). Re-derives the checklist so filled blanks
  // drop off, and updates the refs/history so any following AI pass builds on the
  // already-filled text.
  function applyServerDraft(text: string) {
    const fake = `---DRAFT READY---\n${text}\n---END DRAFT---`;
    let p = parseDrafterResponse(fake);
    if (!p.draftText) p.draftText = text;
    p = ensureChecklistNeeds(p);
    setParsed(p);
    setMessages([{ role: "assistant", content: fake }]);
    lastAssistantRef.current = fake;
    setAnswers({});
    setExtraNote("");
  }

  // After the first draft lands, fold the client's saved starter answers into it.
  // Answers that map to exactly one placeholder are filled DETERMINISTICALLY (no
  // AI, no failure mode); everything ambiguous or free-form goes to ONE model
  // refine pass. Runs only once a draft already exists, so it never interrupts the
  // original build — and unanswered questions simply remain as placeholders.
  async function maybeFoldStarterAnswers() {
    // Drains the ref across passes so any answers staged WHILE an earlier fold was
    // awaiting async work (deterministic fill + AI refine pass) are still folded
    // in, instead of being stranded in the ref. Bounded to avoid a runaway loop.
    await drainStagedStarter(pendingStarterRef, foldStagedStarterAnswers);
  }

  async function foldStagedStarterAnswers(staged: { filled: LabeledAnswer[]; note: string }) {
    const draftText =
      parseDrafterResponse(lastAssistantRef.current).draftText ?? lastAssistantRef.current.trim();
    const docId = docIdRef.current || documentId;

    let leftover: LabeledAnswer[] = staged.filled;

    // Deterministic fill for answers that map to a unique placeholder.
    if (draftText && docId && staged.filled.length) {
      const { byKey, leftover: lo } = mapAnswersToPlaceholders(draftText, staged.filled);
      if (Object.keys(byKey).length) {
        try {
          const res = await fetch(`/api/documents/${docId}/fill-info`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers: byKey }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.draft_text) applyServerDraft(data.draft_text);
            leftover = lo; // only the unmatched answers still need the AI pass
          }
          // On a non-OK response we keep `leftover = staged.filled` so the AI pass
          // still folds everything in — no answer is ever dropped.
        } catch {
          // Network error — fall through with the full set staged for the AI pass.
        }
      } else {
        leftover = lo;
      }
    }

    // Anything not filled deterministically (+ any free-form note) → one AI pass.
    const msg = buildBundledMessage(
      leftover.map((a, i) => ({ id: `lo-${i}`, label: a.label, hint: "", severity: "helpful" as const })),
      Object.fromEntries(leftover.map((a, i) => [`lo-${i}`, a.value])),
      staged.note,
    );
    if (msg) {
      await runDrafter(
        [
          { role: "assistant", content: lastAssistantRef.current },
          { role: "user", content: msg },
        ],
        false
      );
    }
  }

  // Save starter answers as confirmed facts immediately (independent of the
  // in-flight draft) and stage them to be folded in once the draft is ready.
  // This only writes facts — it does NOT trigger generation, so it can't disrupt
  // the document currently being built.
  async function handleSaveStarter() {
    if (!starterItems.length) return;
    const saved = await persistAnswers(starterItems);
    if (!saved) {
      setError("We couldn't save your answers just now — they're still here. Please tap Save again in a moment.");
      return;
    }
    const filled: LabeledAnswer[] = starterItems
      .filter((it) => answers[it.id]?.trim())
      .map((it) => ({ label: it.label, value: answers[it.id].trim() }));
    // Merge into any previously-staged answers rather than overwriting. The
    // client can save more than once — including while an earlier fold is still
    // awaiting — so a plain overwrite would silently drop the earlier batch.
    // Dedupe by label, latest value wins.
    pendingStarterRef.current = mergeStagedStarter(
      pendingStarterRef.current,
      filled,
      extraNote.trim()
    );
    setStarterSaved(true);
    setError("");
  }

  // Kick off "Improve My Draft" generation now that a base attachment (existing
  // or freshly uploaded) has been chosen. No starter questions for this type —
  // the uploaded document itself is the input.
  async function startImproveDraft(attachmentId: string) {
    baseAttachmentIdRef.current = attachmentId;
    setImproveDraftGated(false);
    await runDrafter([], true);
  }

  async function uploadImproveDraftFile(file: File) {
    setImproveUploadError("");
    setImproveUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("caseFileId", caseFileId);
      form.append("analyze", "true");
      const res = await fetch("/api/attachments/upload", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setImproveUploadError(data.error ?? "Upload failed");
        return;
      }
      const data = await res.json();
      await startImproveDraft(data.id);
    } catch {
      setImproveUploadError("Upload failed — please try again");
    } finally {
      setImproveUploading(false);
    }
  }

  function handleImproveFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadImproveDraftFile(file);
  }

  function handleImproveDrop(e: React.DragEvent) {
    e.preventDefault();
    setImproveDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadImproveDraftFile(file);
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
          baseAttachmentId: wizardType === "improve_draft" ? (baseAttachmentIdRef.current || undefined) : undefined,
          isInit,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(body?.error || `Server error ${res.status}`);
      }

      const data = await res.json() as { text: string; documentId: string | null; truncated?: boolean; gapSyncWarning?: boolean; alreadyFinalized?: boolean; status?: string | null };
      const fullText = data.text ?? "";

      if (data.documentId) {
        setDocumentId(data.documentId);
        docIdRef.current = data.documentId;
      }
      if (data.truncated) setTruncatedDraft(true);
      setGapSyncWarning(Boolean(data.gapSyncWarning));

      // The server resolved us to an already-finalized / in-review primary document
      // instead of overwriting it. Reflect that state so the client sees their real
      // submitted document rather than an editable re-draft.
      if (data.alreadyFinalized && data.status === "pending_review") {
        setSubmittedForReview(true);
      }

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: fullText };
        return next;
      });
      lastAssistantRef.current = fullText;

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

  // Persist the client's checklist answers as confirmed facts on the file BEFORE
  // any draft generation. These are key facts — they must survive even if the
  // drafter fails, times out, or the tab is closed.
  // Returns true when there was nothing to save OR the save succeeded. Returns
  // false only when a real save was attempted and failed — the caller then stops
  // and tells the client to retry, so answers are never silently discarded.
  async function persistAnswers(items: ReturnType<typeof buildNeededItems>): Promise<boolean> {
    const filled = items
      .filter((it) => answers[it.id]?.trim())
      .map((it) => ({ label: it.label, value: answers[it.id].trim() }));
    const note = extraNote.trim();
    if (!filled.length && !note) return true;
    try {
      const res = await fetch("/api/wizard/save-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFileId, answers: filled, extraNote: note }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Bundle every filled checklist field (plus any free-form note) into a single
  // labeled update so the model knows exactly what each answer is for.
  async function handleSubmitAnswers() {
    if (streaming || submitting || !parsed) return;
    const items = buildNeededItems(parsed);
    const msg = buildBundledMessage(items, answers, extraNote);
    if (!msg) return;

    // Save the answers as facts first, independent of (and before) generation.
    // If this fails we stop here — answers stay in the form so the client can
    // retry — rather than generate and risk losing them.
    const saved = await persistAnswers(items);
    if (!saved) {
      setError("We couldn't save your answers just now — they're still here. Please tap Update again in a moment.");
      return;
    }

    setJustUpdated(false);
    const userMsg: Message = { role: "user", content: msg };
    const ok = await runDrafter([...messages, userMsg], false);
    if (ok) {
      setJustUpdated(true);
      // Bias toward moving the document forward: once the client has answered a
      // round of questions, update the draft AND send it straight to the
      // attorney (placeholders and all). Previously answers only saved a local
      // "draft" the client had to separately submit — so progress looked lost.
      // Attorney-users are the reviewing attorney for their own client's
      // matter — there is no one to submit to, so just leave the draft updated.
      if (!isAttorneyUser) {
        await submitToAttorney();
      }
    }
  }

  // Free-form "ask for a change" edit — the attorney-user path to keep
  // refining a draft once the checklist has no remaining blanks (or any time
  // they'd rather just say what they want changed). The server applies a
  // targeted edit instead of a full regeneration for attorney-user accounts
  // (see buildDrafterSystemPrompt("attorney") in lib/prompts.ts).
  async function sendChatEdit() {
    const text = chatInput.trim();
    if (!text || streaming) return;
    setChatInput("");
    setJustUpdated(false);
    const userMsg: Message = { role: "user", content: text };
    const ok = await runDrafter([...messages, userMsg], false);
    if (ok) setJustUpdated(true);
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

  async function submitToAttorney() {
    if (submitting) return;
    const id = docIdRef.current || documentId;
    if (!id) {
      setError("Your draft was saved but we couldn't send it just yet. Please click “Send to Attorney” again in a moment.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${id}/submit`, { method: "POST" });
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
  const starterFilledCount = starterItems.filter((it) => answers[it.id]?.trim()).length;
  const hasStarterInput = starterFilledCount > 0 || extraNote.trim().length > 0;

  if (docReviewGated) {
    return (
      <div className="wiz-shell wiz-shell-v2">
        <header className="wiz-header">
          <button className="wiz-back" onClick={() => router.push("/dashboard")}>← Back to File</button>
          <div className="wiz-title">
            <span className="wiz-type-pill">{label}</span>
          </div>
        </header>
        <div className="wiz-gate">
          <div className="wiz-gate-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
          </div>
          <h2 className="wiz-gate-title">Upload a document you want reviewed by the attorney</h2>
          <p className="wiz-gate-msg">
            Document Review reads a document you provide and checks it against your file.
            You haven’t uploaded one yet — add the document you want reviewed by the attorney
            to your file, then start the review.
          </p>
          <button
            className="wiz-gate-btn"
            onClick={() => router.push(caseFileId ? `/dashboard/${caseFileId}#attachments` : "/dashboard")}
          >
            Go to my file to upload →
          </button>
        </div>
      </div>
    );
  }

  if (improveDraftGated) {
    return (
      <div className="wiz-shell wiz-shell-v2">
        <header className="wiz-header">
          <button className="wiz-back" onClick={() => router.push("/dashboard")}>← Back to File</button>
          <div className="wiz-title">
            <span className="wiz-type-pill">{label}</span>
          </div>
        </header>
        <div className="wiz-gate">
          <div className="wiz-gate-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h2 className="wiz-gate-title">Upload the draft you want us to improve</h2>
          <p className="wiz-gate-msg">
            We&apos;ll read your document and produce a materially better version —
            tighter language, filled-in facts from your file, and any legal gaps flagged —
            in the same drafting workspace as every other document.
          </p>

          {existingDraftAttachments.length > 0 && (
            <div className="imp-existing-list">
              {existingDraftAttachments.map((a) => (
                <button
                  key={a.id}
                  className="imp-existing-item"
                  onClick={() => startImproveDraft(a.id)}
                  disabled={improveUploading}
                >
                  Use “{a.file_name}” →
                </button>
              ))}
            </div>
          )}

          <input
            ref={improveFileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.rtf"
            style={{ display: "none" }}
            onChange={handleImproveFileInput}
          />

          {improveUploading ? (
            <div className="att-upload-zone att-upload-zone-busy">
              <span className="att-uploading-msg">Uploading and starting your draft…</span>
            </div>
          ) : (
            <div
              className={`att-upload-zone${improveDragOver ? " att-upload-zone-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setImproveDragOver(true); }}
              onDragLeave={() => setImproveDragOver(false)}
              onDrop={handleImproveDrop}
              onClick={() => improveFileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); improveFileInputRef.current?.click(); } }}
            >
              <span className="att-drop-hint">
                {improveDragOver ? "Drop your file here" : "Drag & drop your draft, or click to add"}
              </span>
              <span className="att-upload-hint">PDF, Word, or text · up to 25 MB</span>
            </div>
          )}

          {improveUploadError && <p className="att-upload-error">{improveUploadError}</p>}
        </div>
      </div>
    );
  }

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
              <div className="wiz-gen-error-actions">
                <button className="wiz-retry-btn" onClick={() => { setError(""); runDrafter([], true); }}>
                  Try Again →
                </button>
                <button className="wiz-gen-error-back" onClick={() => router.push("/dashboard")}>
                  ← Back to my file
                </button>
              </div>
              <p className="wiz-gen-error-reassure">
                Nothing is lost — your file and answers are saved. You can come back and try again any time.
              </p>
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
              {/* Starter questions — surfaced while the first draft is still being
                  prepared so the client can answer during the wait. Saving only
                  writes facts; the answers are folded into the draft once ready. */}
              {!currentDraft && starterItems.length > 0 && (
                <div className="wiz-checklist">
                  <div className="wiz-checklist-head">
                    <h3 className="wiz-checklist-title">A few quick questions while we prepare your {label}</h3>
                    <p className="wiz-checklist-sub">
                      Your draft is being prepared right now. Answer what you can in
                      the meantime — we&apos;ll fold these straight into the document
                      the moment it&apos;s ready. It&apos;s fine to leave anything blank.
                    </p>
                  </div>

                  <div className="wiz-field-list">
                    {starterItems.map((it) => (
                      <div key={it.id} className="wiz-field">
                        <label className="wiz-field-label" htmlFor={`starter-${it.id}`}>
                          <span className="wiz-qa-dot wiz-qa-dot-amber" />
                          {it.label}
                        </label>
                        {it.hint && <p className="wiz-field-hint">{it.hint}</p>}
                        <div className="wiz-field-input-row">
                          <input
                            id={`starter-${it.id}`}
                            className="wiz-field-input"
                            type="text"
                            value={answers[it.id] ?? ""}
                            placeholder="Type your answer…"
                            onChange={(e) => {
                              setStarterSaved(false);
                              setAnswers((prev) => ({ ...prev, [it.id]: e.target.value }));
                            }}
                          />
                          <VoiceInputButton
                            compact
                            onTranscript={(t) => {
                              setStarterSaved(false);
                              setAnswers((prev) => ({ ...prev, [it.id]: appendDictation(prev[it.id], t) }));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="wiz-field wiz-field-note">
                    <label className="wiz-field-label" htmlFor="starter-extra">
                      {isAttorneyUser ? "Anything else to note? (optional)" : "Anything else the attorney should know? (optional)"}
                    </label>
                    <textarea
                      id="starter-extra"
                      className="wiz-input"
                      rows={3}
                      value={extraNote}
                      placeholder="Add any extra context, special requests, or clarifications…"
                      onChange={(e) => {
                        setStarterSaved(false);
                        setExtraNote(e.target.value);
                      }}
                    />
                    <VoiceInputButton
                      onTranscript={(t) => {
                        setStarterSaved(false);
                        setExtraNote((v) => appendDictation(v, t));
                      }}
                    />
                  </div>

                  {starterSaved && (
                    <div className="wiz-updated-confirm">
                      Saved ✓ — we&apos;ll include these as soon as your draft is ready
                    </div>
                  )}

                  <button
                    className="wiz-send"
                    onClick={handleSaveStarter}
                    disabled={!hasStarterInput || starterSaved}
                  >
                    {starterSaved ? "Saved ✓" : "Save my answers"}
                  </button>
                </div>
              )}

              {/* Persistent reassurance — blanks never block your draft */}
              {currentDraft && (
                <div className="wiz-reassure" role="note">
                  <span className="wiz-reassure-icon">✓</span>
                  <div>
                    {isAttorneyUser ? (
                      <><strong>It&apos;s okay to leave blanks.</strong> Your draft is ready now. Fill in what you know, update the draft, and download it whenever you&apos;re ready — any remaining placeholders stay highlighted for you to finish.</>
                    ) : (
                      <><strong>It&apos;s okay to leave blanks.</strong> Your draft is ready now. Fill in what you know, then send it — Andrew Crawford, Esq. will fill in anything that&apos;s missing and follow up with you about it.</>
                    )}
                  </div>
                </div>
              )}

              {/* Ask for a change — attorney-user only. A persistent chat, not a
                  checklist: type what you want changed and get a targeted edit
                  back, like directing a junior associate. This is the only edit
                  path once the checklist below has no remaining blanks. */}
              {currentDraft && isAttorneyUser && (
                <div className="wiz-chat-edit">
                  <label className="wiz-field-label" htmlFor="wiz-chat-input">Ask for a change</label>
                  <p className="wiz-field-hint">
                    e.g. &quot;Change the notice period to 60 days&quot; or &quot;Add a force majeure clause.&quot;
                    Only what you ask for changes — everything else stays as-is.
                  </p>
                  <div className="wiz-field-input-row">
                    <textarea
                      id="wiz-chat-input"
                      className="wiz-input"
                      rows={2}
                      value={chatInput}
                      disabled={streaming}
                      placeholder="Type the change you want…"
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendChatEdit();
                        }
                      }}
                    />
                    <VoiceInputButton
                      compact
                      disabled={streaming}
                      onTranscript={(t) => setChatInput((v) => appendDictation(v, t))}
                    />
                  </div>
                  <button
                    className="wiz-send"
                    onClick={sendChatEdit}
                    disabled={streaming || !chatInput.trim()}
                  >
                    {streaming ? "Updating draft…" : "Send →"}
                  </button>
                </div>
              )}

              {/* Truncation amber notice — soft warning, never blocks the checklist */}
              {truncatedDraft && currentDraft && (
                <div className="wiz-truncation-notice" role="status">
                  <span className="wiz-truncation-icon">⚠</span>
                  <span>
                    The AI draft may have been cut short on a very long document. Review the
                    draft carefully for any abrupt endings, then fill in the fields below and
                    click <strong>Update Draft</strong>, send to the attorney as-is, or
                    regenerate it from scratch.
                  </span>
                  <button
                    className="wiz-retry-btn"
                    onClick={() => { setTruncatedDraft(false); runDrafter([], true); }}
                    disabled={streaming}
                  >
                    Regenerate
                  </button>
                  <button
                    className="wiz-truncation-dismiss"
                    onClick={() => setTruncatedDraft(false)}
                    aria-label="Dismiss notice"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Living File sync warning — soft, never blocks the checklist. The
                  draft is already saved; only the dashboard's outstanding-items
                  list may briefly lag. */}
              {gapSyncWarning && currentDraft && (
                <div className="wiz-truncation-notice" role="status">
                  <span className="wiz-truncation-icon">⚠</span>
                  <span>
                    Your draft is saved, but we couldn&apos;t refresh your file&apos;s
                    outstanding-items list just now. Nothing is lost — this only affects the
                    checklist on your dashboard, and the attorney still sees the full draft.
                  </span>
                  <button
                    className="wiz-truncation-dismiss"
                    onClick={() => setGapSyncWarning(false)}
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
                      {isAttorneyUser ? (
                        <>Fill in what you know — you don&apos;t have to answer everything.
                        When you&apos;re done, click <strong>Update Draft</strong>: we&apos;ll
                        update your document. Anything you leave blank stays as a highlighted
                        placeholder for you to finish before you download it.</>
                      ) : (
                        <>Fill in what you know — you don&apos;t have to answer everything.
                        When you&apos;re done, click <strong>Update Draft &amp; Send to
                        Attorney</strong>: we&apos;ll update your document and send it
                        straight to Andrew Crawford, Esq. for review. Anything you leave
                        blank stays as a highlighted placeholder for him to finalize.</>
                      )}
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
                        <div className="wiz-field-input-row">
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
                          <VoiceInputButton
                            compact
                            disabled={streaming}
                            onTranscript={(t) =>
                              setAnswers((prev) => ({ ...prev, [it.id]: appendDictation(prev[it.id], t) }))
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="wiz-field wiz-field-note">
                    <label className="wiz-field-label" htmlFor="fld-extra">
                      {isAttorneyUser ? "Anything else to note? (optional)" : "Anything else the attorney should know? (optional)"}
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
                    <VoiceInputButton
                      disabled={streaming}
                      onTranscript={(t) => setExtraNote((v) => appendDictation(v, t))}
                    />
                  </div>

                  {justUpdated && (
                    <div className="wiz-updated-confirm">Draft updated ✓</div>
                  )}

                  <button
                    className="wiz-send"
                    onClick={handleSubmitAnswers}
                    disabled={streaming || submitting || !hasAnyInput}
                  >
                    {streaming
                      ? "Updating draft…"
                      : submitting
                        ? "Sending to attorney…"
                        : isAttorneyUser
                          ? (filledCount > 0 ? `Update Draft (${filledCount} answer${filledCount > 1 ? "s" : ""}) →` : "Update Draft →")
                          : filledCount > 0
                            ? `Update Draft & Send to Attorney (${filledCount} answer${filledCount > 1 ? "s" : ""}) →`
                            : "Update Draft & Send to Attorney →"}
                  </button>
                </div>
              )}

              {/* No remaining gaps — draft looks complete */}
              {currentDraft && neededItems.length === 0 && (
                <div className="wiz-checklist wiz-checklist-complete">
                  <h3 className="wiz-checklist-title">Your draft looks complete</h3>
                  <p className="wiz-checklist-sub">
                    {isAttorneyUser
                      ? "We didn't find any remaining blanks. Review the document on the left, then download it below."
                      : "We didn't find any remaining blanks. Review the document on the left, then send it to the attorney below."}
                  </p>
                  {justUpdated && <div className="wiz-updated-confirm">Draft updated ✓</div>}
                </div>
              )}

              {error && <div className="wiz-error">{error}</div>}

              {/* Send as-is — for clients who have nothing to add and just want the
                  current draft in front of the attorney right now. If they HAVE
                  typed answers, this routes through handleSubmitAnswers first so
                  those answers aren't lost. Attorney-users have no attorney to
                  send to, so they get a simple download prompt instead. */}
              {currentDraft && (
                isAttorneyUser ? (
                  <div className="wiz-submit-area">
                    <div className="wiz-attorney-framing">
                      <p className="wiz-attorney-lead">Ready to use?</p>
                      <p className="wiz-attorney-body">
                        Download the current draft (.docx) from the button at the top of the
                        page whenever you&apos;re ready. Any remaining highlighted placeholders
                        are yours to finish before you use it with your client.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="wiz-submit-area">
                    <div className="wiz-attorney-framing">
                      <p className="wiz-attorney-lead">Nothing to add?</p>
                      <p className="wiz-attorney-body">
                        You can send the current draft to Andrew Crawford, Esq. right
                        now, exactly as it is. He&apos;ll fill in any highlighted blanks
                        and follow up with you about anything he needs.
                      </p>
                    </div>
                    <p className="wiz-submit-hint">
                      {blockingCount > 0
                        ? `${blockingCount} item${blockingCount > 1 ? "s" : ""} still blank — that's okay, the attorney will follow up on what's needed.`
                        : "Sending starts the 48-hour attorney review clock."}
                    </p>
                    <button
                      className="wiz-submit-btn"
                      onClick={hasAnyInput ? handleSubmitAnswers : submitToAttorney}
                      disabled={submitting || streaming || !documentId}
                    >
                      {submitting
                        ? "Sending…"
                        : streaming
                          ? "Working…"
                          : !documentId
                            ? "Preparing draft…"
                            : hasAnyInput
                              ? "Update Draft & Send to Attorney →"
                              : "Send Draft to Attorney As-Is →"}
                    </button>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
