"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Attachment, Document, DocumentComment, DocumentReviewRun, DocumentImprovement, DocumentQaCitation, DocumentDeliveryDraft, DocumentQaFinding, DocumentQaCheckType } from "@/lib/types";
import { DOCUMENT_QA_CHECK_TYPES, docTypeLabel, personDisplayName, citationBlocksApproval } from "@/lib/types";
import AccountMenu from "@/components/AccountMenu";
import ReviewContextPane from "@/components/attorney-review/ReviewContextPane";
import ReviewCoverSheet from "@/components/attorney-review/ReviewCoverSheet";
import ReviewDocumentEditor from "@/components/attorney-review/ReviewDocumentEditor";
import ReviewPartnerChat from "@/components/attorney-review/ReviewPartnerChat";
import type { ReviewChange, RevisionSaveState } from "@/components/attorney-review/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DocumentDetail {
  id: string;
  title: string;
  doc_type: string;
  status: string;
  content_json: Record<string, unknown>;
  draft_text: string | null;
  attorney_notes: string | null;
  attorney_second_draft_prompt: string | null;
  review_report: string | null;
  review_status: string | null;
  submitted_at: string | null;
  created_at: string;
  case_file_id: string;
  user_id: string;
  case_files: {
    id: string;
    matter_type: string | null;
    matter_subtype: string | null;
    summary: string | null;
    goals: string[];
    next_action: string | null;
  };
  profiles: {
    full_name: string | null;
    email: string;
    phone: string | null;
  };
  child_documents?: Document[];
}

interface PersistedValidationReport {
  ready_for_attorney_review: boolean;
  errors: Array<{ code: string; message: string }>;
}

// Reads the NDJSON stream from the second-draft endpoint, ignoring heartbeat
// lines, and returns the final outcome object (result / fitness_reject / error).
async function readFinalNdjson(
  res: Response
): Promise<Record<string, unknown> | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: Record<string, unknown> | null = null;

  const consume = (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (obj.type !== "heartbeat") last = obj;
      } catch {
        /* ignore partial/malformed line */
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    consume(decoder.decode(value, { stream: true }));
  }
  consume(decoder.decode());

  // Parse any trailing data that arrived without a final newline so a complete
  // last line is never dropped.
  const tail = buffer.trim();
  if (tail) {
    try {
      const obj = JSON.parse(tail) as Record<string, unknown>;
      if (obj.type !== "heartbeat") last = obj;
    } catch {
      /* incomplete/truncated final line — leave `last` as the prior value */
    }
  }
  return last;
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientNotes, setClientNotes] = useState("");
  const [secondDraftPrompt, setSecondDraftPrompt] = useState("");
  const [promptSaved, setPromptSaved] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [generatingSecondDraft, setGeneratingSecondDraft] = useState(false);
  const [aiError, setAiError] = useState("");
  const [secondDraftMessage, setSecondDraftMessage] = useState("");
  // Feeds #123's ReviewContextPane. Auto-merge dropped this alongside #126's
  // sidebar rewrite; the pane still referenced it, so typecheck caught it.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [fitnessWarning, setFitnessWarning] = useState<{
    rationale: string;
    recommendedType: string | null;
  } | null>(null);
  // "Junior associate" chat: targeted edits against the working (second-draft)
  // document, distinct from the one-shot critical-review/second-draft pipeline
  // above. Ephemeral — a refresh reloads the persisted draft text, not the
  // conversation, same as the client wizard's equivalent chat.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [revisionText, setRevisionText] = useState("");
  const [revisionSource, setRevisionSource] = useState<"second_draft" | "working_copy">("working_copy");
  const [saveState, setSaveState] = useState<RevisionSaveState>("idle");
  const [proposedChanges, setProposedChanges] = useState<ReviewChange[]>([]);
  const [collapsed, setCollapsed] = useState({ context: false, editor: false, partner: false });
  const revisionRef = useRef("");
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Orchestrator review run (schema-stage44): auto-kicks off on submission and
  // drives issue-spotting -> revised draft. This page reads its live state and
  // renders the structured improvements list.
  const [reviewRun, setReviewRun] = useState<DocumentReviewRun | null>(null);
  const [improvements, setImprovements] = useState<DocumentImprovement[]>([]);
  const [citations, setCitations] = useState<DocumentQaCitation[]>([]);
  const [focusedImprovementId, setFocusedImprovementId] = useState<string | null>(null);
  const [improvementBusy, setImprovementBusy] = useState<string | null>(null);
  const [editingImprovementId, setEditingImprovementId] = useState<string | null>(null);
  const [editedImprovementText, setEditedImprovementText] = useState("");
  const [improvementError, setImprovementError] = useState("");
  const workingEditorRef = useRef<HTMLDivElement | null>(null);
  const [qaFindings, setQaFindings] = useState<DocumentQaFinding[]>([]);
  const [selectedChecks, setSelectedChecks] = useState<DocumentQaCheckType[]>([...DOCUMENT_QA_CHECK_TYPES]);
  const [qaBusy, setQaBusy] = useState(false);
  const [qaError, setQaError] = useState("");
  const [waivingId, setWaivingId] = useState<string | null>(null);
  const [deliveryDraft, setDeliveryDraft] = useState<DocumentDeliveryDraft | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState<"save" | "send" | "approve-send" | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const runStartedRef = useRef(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    load();
    loadReviewRun({ allowAutoStart: true });
    loadDeliveryDraft();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (runPollRef.current) clearInterval(runPollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveRevision = useCallback(async () => {
    if (!dirtyRef.current) return true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const textBeingSaved = revisionRef.current;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/attorney/documents/${id}/revision`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: textBeingSaved }), keepalive: true });
      if (!res.ok) throw new Error("save failed");
      setRevisionSource("second_draft");
      if (revisionRef.current === textBeingSaved) {
        dirtyRef.current = false;
        setSaveState("saved");
      } else {
        setSaveState("dirty");
      }
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  }, [id]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      navigator.sendBeacon(`/api/attorney/documents/${id}/revision`, new Blob([JSON.stringify({ text: revisionRef.current })], { type: "application/json" }));
      event.preventDefault();
    };
    const pageHide = () => { if (dirtyRef.current) navigator.sendBeacon(`/api/attorney/documents/${id}/revision`, new Blob([JSON.stringify({ text: revisionRef.current })], { type: "application/json" })); };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", pageHide);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("pagehide", pageHide); if (saveTimerRef.current) clearTimeout(saveTimerRef.current); void saveRevision(); };
  }, [id, saveRevision]);

  function editRevision(text: string) {
    revisionRef.current = text; setRevisionText(text); dirtyRef.current = true; setSaveState("dirty");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void saveRevision(), 900);
  }

  // Read the orchestrator run + structured improvements. On first load, if the
  // document is awaiting review and no run has ever started (e.g. the submit-time
  // fire-and-forget was cut off), kick one off — the self-heal path.
  async function loadReviewRun(opts: { allowAutoStart?: boolean } = {}) {
    const res = await fetch(`/api/attorney/documents/${id}/review-run`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      run: DocumentReviewRun | null;
      improvements: DocumentImprovement[];
      citations?: DocumentQaCitation[];
      findings?: DocumentQaFinding[];
    };
    setReviewRun(data.run);
    setImprovements(data.improvements ?? []);
    setCitations(data.citations ?? []);
    setQaFindings(data.findings ?? []);

    if (!data.run && opts.allowAutoStart && !runStartedRef.current) {
      runStartedRef.current = true;
      await startReviewRun();
      return;
    }
    if (data.run && (data.run.status === "queued" || data.run.status === "running")) {
      startRunPolling();
    }
  }

  async function loadDeliveryDraft() {
    const res = await fetch(`/api/attorney/documents/${id}/delivery`);
    if (res.ok) {
      const data = await res.json() as { draft: DocumentDeliveryDraft | null };
      setDeliveryDraft(data.draft);
    }
  }

  async function saveDeliveryDraft(): Promise<boolean> {
    if (!deliveryDraft) return false;
    setDeliveryBusy("save"); setDeliveryStatus("");
    const res = await fetch(`/api/attorney/documents/${id}/delivery`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deliveryDraft) });
    const data = await res.json().catch(() => ({}));
    setDeliveryBusy(null);
    if (!res.ok) { setDeliveryStatus(data.error ?? "Unable to save draft."); return false; }
    setDeliveryDraft(data.draft); setDeliveryStatus("Message draft saved."); return true;
  }

  async function sendDelivery(approveAndSend: boolean) {
    if (!deliveryDraft || deliveryBusy) return;
    if (!await saveDeliveryDraft()) return;
    setDeliveryBusy(approveAndSend ? "approve-send" : "send"); setDeliveryStatus("");
    const res = await fetch(`/api/attorney/documents/${id}/delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approveAndSend }) });
    const data = await res.json().catch(() => ({}));
    setDeliveryBusy(null);
    if (res.ok) setDone(true); else setDeliveryStatus(data.error ?? "Unable to send.");
  }

  async function startReviewRun() {
    runStartedRef.current = true;
    const res = await fetch(`/api/attorney/documents/${id}/review-run`, { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { run: DocumentReviewRun };
      setReviewRun(data.run);
      startRunPolling();
    }
  }

  async function runQa(mode: "all" | "selected" | "affected") {
    setQaBusy(true);
    setQaError("");
    try {
      const res = await fetch(`/api/attorney/documents/${id}/review-run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, checkTypes: selectedChecks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "QA checks failed");
      await loadReviewRun();
    } catch (err) {
      setQaError(err instanceof Error ? err.message : "QA checks failed");
    } finally { setQaBusy(false); }
  }

  async function updateFinding(finding: DocumentQaFinding, status: "resolved" | "waived" | "open") {
    const resolutionNote = status === "waived" ? window.prompt("Record why you are waiving this blocking result (attorney judgment):") : undefined;
    if (status === "waived" && !resolutionNote?.trim()) return;
    const res = await fetch(`/api/attorney/documents/${id}/review-run/findings/${finding.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, resolutionNote }),
    });
    if (res.ok) {
      const data = await res.json() as { finding: DocumentQaFinding };
      setQaFindings((rows) => rows.map((row) => row.id === data.finding.id ? data.finding : row));
    }
  }

  async function waiveCitation(citationId: string, waived: boolean) {
    setWaivingId(citationId);
    try {
      const res = await fetch(`/api/attorney/documents/${id}/citations/${citationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waived }),
      });
      if (res.ok) {
        const data = (await res.json()) as { citation: DocumentQaCitation };
        setCitations((prev) => prev.map((c) => (c.id === data.citation.id ? data.citation : c)));
      }
    } finally {
      setWaivingId(null);
    }
  }

  function focusImprovement(imp: DocumentImprovement) {
    setFocusedImprovementId(imp.id);
    workingEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function proposeImprovement(imp: DocumentImprovement, editedText?: string) {
    setImprovementBusy(imp.id);
    setImprovementError("");
    try {
      const res = await fetch(`/api/attorney/documents/${id}/improvements/${imp.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedText === undefined ? {} : { edited_text: editedText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create proposed diff");
      setImprovements((prev) => prev.map((item) => item.id === imp.id ? data.improvement : item));
      setEditingImprovementId(null);
      focusImprovement(data.improvement);
    } catch (err) { setImprovementError(err instanceof Error ? err.message : "Could not create proposed diff"); }
    finally { setImprovementBusy(null); }
  }

  async function dispositionImprovement(imp: DocumentImprovement, disposition: "accepted" | "rejected" | "ask_partner" | "needs_client_input") {
    const rationale = disposition === "accepted" ? "" : (window.prompt("Optional rationale", imp.attorney_rationale ?? "") ?? "");
    setImprovementBusy(imp.id); setImprovementError("");
    try {
      const res = await fetch(`/api/attorney/documents/${id}/improvements/${imp.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disposition, rationale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save decision");
      setImprovements((prev) => prev.map((item) => item.id === imp.id ? data.improvement : item));
      if (typeof data.workingDraft === "string") { await load(); await loadReviewRun(); }
      else if (data.qaRerun) await loadReviewRun();
    } catch (err) { setImprovementError(err instanceof Error ? err.message : "Could not save decision"); }
    finally { setImprovementBusy(null); }
  }

  function startRunPolling() {
    if (runPollRef.current) return;
    runPollRef.current = setInterval(async () => {
      const res = await fetch(`/api/attorney/documents/${id}/review-run`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        run: DocumentReviewRun | null;
        improvements: DocumentImprovement[];
        citations?: DocumentQaCitation[];
        findings?: DocumentQaFinding[];
      };
      setReviewRun(data.run);
      setImprovements(data.improvements ?? []);
      setCitations(data.citations ?? []);
      setQaFindings(data.findings ?? []);
      if (!data.run || (data.run.status !== "queued" && data.run.status !== "running")) {
        if (runPollRef.current) clearInterval(runPollRef.current);
        runPollRef.current = null;
        // Pull in the freshly-generated revised draft + critical review children.
        load();
        loadDeliveryDraft();
      }
    }, 4000);
  }

  async function load() {
    const res = await fetch(`/api/documents/${id}`);
    if (res.ok) {
      const data = await res.json() as DocumentDetail;
      setDoc(data);
      if (!dirtyRef.current) {
        const latest = (data.child_documents ?? []).filter((child) => child.doc_type === "second_draft").sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
        const editable = latest?.draft_text ?? data.draft_text ?? "";
        revisionRef.current = editable; setRevisionText(editable); setRevisionSource(latest ? "second_draft" : "working_copy"); setSaveState("idle");
      }
      setClientNotes(data.attorney_notes ?? "");
      setSecondDraftPrompt(data.attorney_second_draft_prompt ?? "");
      const caseFileId = data.case_files?.id;
      if (caseFileId) {
        const attRes = await fetch(`/api/attachments?caseFileId=${caseFileId}`);
        if (attRes.ok) {
          const attData = await attRes.json();
          setAttachments(attData.attachments ?? []);
        }
      }
      if (data.review_status === "reviewing" || data.review_status === "merging") {
        startPolling();
      }
      loadComments();
    } else {
      setError("Document not found or access denied");
    }
    setLoading(false);
  }

  async function loadComments() {
    const res = await fetch(`/api/attorney/documents/${id}/comments`);
    if (res.ok) {
      const data = (await res.json()) as { comments: DocumentComment[] };
      setComments(data.comments ?? []);
    }
  }

  async function addComment() {
    const text = newComment.trim();
    if (!text || commentBusy) return;
    setCommentBusy(true);
    try {
      const res = await fetch(`/api/attorney/documents/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        const data = (await res.json()) as { comment: DocumentComment };
        setComments((prev) => [...prev, data.comment]);
        setNewComment("");
      }
    } finally {
      setCommentBusy(false);
    }
  }

  async function toggleCommentResolved(comment: DocumentComment) {
    const res = await fetch(`/api/attorney/documents/${id}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !comment.resolved }),
    });
    if (res.ok) {
      const data = (await res.json()) as { comment: DocumentComment };
      setComments((prev) => prev.map((c) => (c.id === data.comment.id ? data.comment : c)));
    }
  }

  async function deleteComment(commentId: string) {
    const res = await fetch(`/api/attorney/documents/${id}/comments/${commentId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/documents/${id}`);
      if (res.ok) {
        const data = await res.json() as DocumentDetail;
        setDoc(data);
        if (data.review_status !== "reviewing" && data.review_status !== "merging") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setAiRunning(false);
          setGeneratingSecondDraft(false);
        }
      }
    }, 4000);
  }

  async function runManualReview() {
    if (aiRunning) return;
    setAiRunning(true);
    setAiError("");
    try {
      const res = await fetch(`/api/attorney/documents/${id}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "Review failed");
        setAiRunning(false);
        return;
      }
      await load();
    } catch {
      setAiError("Network error — please try again");
    }
    setAiRunning(false);
  }

  async function saveSecondDraftPrompt() {
    setSavingPrompt(true);
    setPromptSaved(false);
    try {
      const res = await fetch(`/api/attorney/documents/${id}/second-draft-prompt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: secondDraftPrompt }),
      });
      if (res.ok) setPromptSaved(true);
    } finally {
      setSavingPrompt(false);
    }
  }

  async function requestSecondDraft() {
    if (generatingSecondDraft || !reviewText) return;
    setGeneratingSecondDraft(true);
    setSecondDraftMessage("");
    setFitnessWarning(null);
    setAiError("");

    try {
      await saveSecondDraftPrompt();
      const res = await fetch(`/api/attorney/documents/${id}/second-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: secondDraftPrompt }),
      });

      // Pre-generation validation failures (auth, missing review, etc.) come back
      // as a normal JSON error response. Generation itself streams NDJSON:
      // heartbeats keep the long Opus call alive, and the final line is the result.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSecondDraftMessage(data.error ?? "Second draft generation failed.");
        setGeneratingSecondDraft(false);
        return;
      }

      const outcome = await readFinalNdjson(res);

      if (outcome?.type === "fitness_reject" && outcome.fitness) {
        const f = outcome.fitness as Record<string, unknown>;
        setFitnessWarning({
          rationale: String(f.rationale ?? ""),
          recommendedType: (f.recommendedType ?? f.recommended_type ?? null) as string | null,
        });
        setSecondDraftMessage(
          (outcome.error as string) ?? "Document type may not be appropriate for this matter."
        );
        setGeneratingSecondDraft(false);
        return;
      }

      if (!outcome || outcome.type === "error" || !outcome.success) {
        setSecondDraftMessage((outcome?.error as string) ?? "Second draft generation failed.");
        setGeneratingSecondDraft(false);
        return;
      }

      setSecondDraftMessage(
        outcome.truncated
          ? "Second draft generated (output was long and may be truncated)."
          : "Second draft generated successfully."
      );
      await load();
    } catch {
      setSecondDraftMessage("Network error — please try again.");
    }
    setGeneratingSecondDraft(false);
  }

  async function handleAction(action: "approve" | "request_changes") {
    if (submitting) return;
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/documents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, attorney_notes: clientNotes }),
    });

    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Action failed");
      setSubmitting(false);
    }
  }

  async function sendChatEdit() {
    const text = chatInput.trim();
    // Never race the Opus second-draft pipeline: it deletes and re-inserts
    // the same second-draft child this chat edits (see chat-edit/route.ts).
    if (!text || chatSending || generatingSecondDraft || doc?.review_status === "merging") return;
    setChatSending(true);
    setChatError("");
    const nextMessages = [...chatMessages, { role: "user" as const, content: text }];
    setChatMessages(nextMessages);
    try {
      const res = await fetch(`/api/attorney/documents/${id}/chat-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, currentText: revisionRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Don't clear the input on failure — the attorney shouldn't have to
        // retype a lost edit request. A 409 means the document changed
        // underneath us (e.g. the 2nd-draft pipeline just finished) — drop
        // the now-stale user turn from the thread and refresh so the next
        // attempt starts from the real current document.
        setChatMessages(chatMessages);
        setChatError(data.error ?? "Edit failed");
        if (res.status === 409) await load();
        return;
      }
      setChatInput("");
      const reply = data.message ?? "Changes proposed.";
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setProposedChanges((prev) => [...prev, ...(data.changes as ReviewChange[])]);
    } catch {
      setChatMessages(chatMessages);
      setChatError("Network error — please try again.");
    } finally {
      setChatSending(false);
    }
  }

  if (loading) return <div className="atty-review-loading">Loading…</div>;
  if (error && !doc) return <div className="atty-review-error">{error}</div>;
  if (!doc) return null;

  if (done) {
    return (
      <div className="atty-review-done">
        <h2>Review submitted</h2>
        <p>Your decision has been recorded.</p>
        <button onClick={() => router.push("/attorney")} className="atty-btn">Back to Dashboard</button>
      </div>
    );
  }

  const children = doc.child_documents ?? [];
  const criticalReview = children.find((c) => c.doc_type === "critical_review");
  const secondDraft = children.find((c) => c.doc_type === "second_draft");
  const reviewText = criticalReview?.draft_text ?? doc.review_report;
  const isReviewing = doc.review_status === "reviewing" || (aiRunning && !generatingSecondDraft);
  const isMerging = doc.review_status === "merging" || generatingSecondDraft;

  return (
    <div className="atty-review-shell">
      <header className="atty-review-header">
        <button className="atty-back" onClick={async () => { await saveRevision(); router.push("/attorney"); }}>← Dashboard</button>
        <div className="atty-review-title">
          <h1>{doc.title}</h1>
          <span className="atty-badge atty-badge-amber">{doc.status.replace(/_/g, " ")}</span>
          {isReviewing && (
            <span className="atty-badge atty-badge-blue atty-badge-pulse">Generating review memo…</span>
          )}
          {isMerging && (
            <span className="atty-badge atty-badge-blue atty-badge-pulse">Generating 2nd draft…</span>
          )}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <AccountMenu onLight />
        </div>
      </header>

      <div className="atty-review-body">
        <div className={`review-collapsible-column${collapsed.context ? " is-collapsed" : ""}`}>
          <button type="button" className="review-pane-toggle" onClick={() => setCollapsed((value) => ({ ...value, context: !value.context }))}>{collapsed.context ? "Show context" : "Hide context"}</button>
          {!collapsed.context && <ReviewContextPane
            clientName={personDisplayName(doc.profiles, "—")} email={doc.profiles.email} phone={doc.profiles.phone}
            matter={`${doc.case_files.matter_type ?? "Unclassified"}${doc.case_files.matter_subtype ? ` — ${doc.case_files.matter_subtype}` : ""}`}
            summary={doc.case_files.summary} caseFileId={doc.case_files.id}
            submitted={new Date(doc.submitted_at ?? doc.created_at).toLocaleString()} attachments={attachments}
            onRunReview={runManualReview} running={aiRunning} hasReview={Boolean(reviewText)} error={aiError}
          />}
          {/* #126's cover sheet, kept alongside #123's context pane rather than
              instead of it. They do not overlap: the pane carries client,
              matter and the review action, while this fetches the case
              substance an attorney reviews against — confirmed facts, open
              gaps, deadlines, existing counsel and source files. */}
          {!collapsed.context && <ReviewCoverSheet documentId={id} fallbackCaseFileId={doc.case_files.id} />}
        </div>
        <div className="atty-review-content">
          {/* Orchestrator auto-review (schema-stage44): live run status + the
              structured improvements it produced. */}
          {reviewRun && (
            <section className="arr-panel">
              <div className="arr-head">
                <div className="arr-title">
                  <span className={`arr-status arr-status-${reviewRun.status}`}>
                    {reviewRun.status === "queued" && "Auto-review queued…"}
                    {reviewRun.status === "running" &&
                      `Auto-review running${reviewRun.stage ? ` · ${reviewRun.stage.replace(/_/g, " ")}` : ""}…`}
                    {reviewRun.status === "awaiting_attorney" && "Auto-review · needs your input"}
                    {reviewRun.status === "complete" &&
                      `Auto-review complete · ${improvements.length} improvement${improvements.length === 1 ? "" : "s"}`}
                    {reviewRun.status === "failed" && "Auto-review failed"}
                  </span>
                  {(reviewRun.status === "queued" || reviewRun.status === "running") && (
                    <span className="arr-spinner" aria-hidden />
                  )}
                </div>
                {(reviewRun.status === "complete" || reviewRun.status === "failed") && (
                  <button type="button" className="atty-btn" onClick={startReviewRun}>
                    Re-run review
                  </button>
                )}
              </div>
              {reviewRun.status === "failed" && reviewRun.error && (
                <p className="arr-error">{reviewRun.error}</p>
              )}
              {improvements.length > 0 && (
                <ol className="arr-list">
                  {improvements.map((imp) => (
                    <li key={imp.id} className={`arr-item ${focusedImprovementId === imp.id ? "arr-item-focused" : ""}`} onClick={() => focusImprovement(imp)}>
                      <div className="arr-item-head">
                        <span className={`arr-sev arr-sev-${imp.severity}`}>{imp.severity}</span>
                        <span className="arr-kind">{imp.kind.replace(/_/g, " ")}</span>
                        <span className="arr-section">{imp.section} · {imp.anchor?.section_id ?? "locating…"}</span>
                      </div>
                      <p className="arr-item-title">{imp.title}</p>
                      {imp.proposed_change && <p className="arr-item-change">{imp.proposed_change}</p>}
                      {imp.rationale && <p className="arr-item-rationale">{imp.rationale}</p>}
                      {imp.proposed_diff && (
                        <div className="arr-diff" aria-label="Proposed diff">
                          <del>{imp.proposed_diff.before}</del><ins>{imp.proposed_diff.after}</ins>
                        </div>
                      )}
                      {editingImprovementId === imp.id && (
                        <textarea className="arr-edit" value={editedImprovementText} onClick={(e) => e.stopPropagation()} onChange={(e) => setEditedImprovementText(e.target.value)} rows={4} />
                      )}
                      <div className="arr-actions" onClick={(e) => e.stopPropagation()}>
                        {imp.status === "proposed" ? <>
                          {!imp.proposed_diff ? <button onClick={() => proposeImprovement(imp)} disabled={improvementBusy === imp.id}>Accept</button> : <button onClick={() => dispositionImprovement(imp, "accepted")} disabled={improvementBusy === imp.id}>Accept proposed diff</button>}
                          {editingImprovementId === imp.id
                            ? <button onClick={() => proposeImprovement(imp, editedImprovementText)} disabled={!editedImprovementText.trim() || improvementBusy === imp.id}>Preview edited diff</button>
                            : <button onClick={() => { setEditingImprovementId(imp.id); setEditedImprovementText(imp.proposed_diff?.after ?? imp.proposed_change); }}>Edit and accept</button>}
                          <button onClick={() => dispositionImprovement(imp, "rejected")}>Reject</button>
                          <button onClick={() => dispositionImprovement(imp, "ask_partner")}>Ask partner</button>
                          <button onClick={() => dispositionImprovement(imp, "needs_client_input")}>Needs client input</button>
                        </> : <span className={`arr-disposition arr-disposition-${imp.status}`}>{imp.status.replace(/_/g, " ")}</span>}
                      </div>
                      {imp.attorney_rationale && <p className="arr-rationale">Attorney note: {imp.attorney_rationale}</p>}
                    </li>
                  ))}
                </ol>
              )}
              {improvementError && <p className="arr-error">{improvementError}</p>}
            </section>
          )}

          <section className="arr-panel arr-qa-workbench">
            <div className="arr-head">
              <div>
                <span className="arr-status">Document QA workbench</span>
                <p className="atty-standalone-doc-sub">Adversarial checks run against the active working revision and matter context.</p>
              </div>
              <div className="arr-qa-controls">
                <button type="button" className="atty-btn" disabled={qaBusy} onClick={() => runQa("all")}>Run all</button>
                <button type="button" className="atty-btn" disabled={qaBusy || selectedChecks.length === 0} onClick={() => runQa("selected")}>Run selected</button>
                <button type="button" className="atty-btn" disabled={qaBusy} onClick={() => runQa("affected")}>Re-run affected</button>
              </div>
            </div>
            <div className="arr-check-grid">
              {DOCUMENT_QA_CHECK_TYPES.map((type) => (
                <label key={type} className="arr-check-option">
                  <input type="checkbox" checked={selectedChecks.includes(type)} onChange={() => setSelectedChecks((current) =>
                    current.includes(type) ? current.filter((item) => item !== type) : [...current, type])} />
                  {type.replace(/_/g, " ")}
                </label>
              ))}
            </div>
            {qaBusy && <p className="atty-ai-running">Running document-specific checks…</p>}
            {qaError && <p className="arr-error">{qaError}</p>}
            {qaFindings.length === 0 && !qaBusy && <p className="atty-ai-empty">No structured findings on the active review yet.</p>}
            {qaFindings.length > 0 && (
              <ul className="arr-cite-list">
                {qaFindings.map((finding) => (
                  <li key={finding.id} className={`arr-cite${finding.severity === "blocking" && finding.status === "open" ? " arr-cite-block" : ""}`}>
                    <div className="arr-cite-head">
                      <span className={`arr-sev arr-sev-${finding.severity === "blocking" ? "high" : finding.severity}`}>{finding.severity}</span>
                      <span className="arr-cite-type">{finding.check_type.replace(/_/g, " ")}</span>
                      <span className="arr-verdict">{finding.status}</span>
                    </div>
                    <strong>{finding.title}</strong>
                    <p className="arr-cite-claim">Location: {finding.document_location}</p>
                    <p className="arr-cite-evidence">{finding.evidence}</p>
                    <p className="arr-cite-evidence">Automated analysis · revision {new Date(finding.last_run_revision).toLocaleString()}</p>
                    <div className="arr-cite-actions">
                      {finding.status === "open" ? <>
                        <button type="button" className="atty-comment-link" onClick={() => updateFinding(finding, "resolved")}>Mark resolved</button>
                        <button type="button" className="atty-comment-link" onClick={() => updateFinding(finding, "waived")}>Attorney waiver…</button>
                      </> : (
                        <button type="button" className="atty-comment-link" onClick={() => updateFinding(finding, "open")}>Reopen</button>
                      )}
                    </div>
                    {finding.status === "waived" && <p className="arr-cite-evidence"><strong>Attorney waiver:</strong> {finding.resolution_note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Authorities QA gate (schema-stage45): every citation verified, or
              approval is blocked until it's verified/removed/waived. */}
          {citations.length > 0 && (() => {
            const blocking = citations.filter(citationBlocksApproval);
            return (
              <section className="arr-panel arr-authorities">
                <div className="arr-head">
                  <span className={`arr-status ${blocking.length ? "arr-status-failed" : "arr-status-complete"}`}>
                    {blocking.length
                      ? `Authorities check · ${blocking.length} unverified — approval blocked`
                      : `Authorities check · all ${citations.length} citation${citations.length === 1 ? "" : "s"} verified`}
                  </span>
                </div>
                <ul className="arr-cite-list">
                  {citations.map((c) => {
                    const blocks = citationBlocksApproval(c);
                    return (
                      <li key={c.id} className={`arr-cite${blocks ? " arr-cite-block" : ""}`}>
                        <div className="arr-cite-head">
                          <span className={`arr-verdict arr-verdict-${c.waived ? "waived" : c.verdict}`}>
                            {c.waived ? "waived" : c.verdict}
                          </span>
                          <span className="arr-cite-type">{c.citation_type}</span>
                          <span className="arr-cite-raw">{c.raw}</span>
                        </div>
                        {c.claim && <p className="arr-cite-claim">Claimed to support: {c.claim}</p>}
                        {c.evidence && <p className="arr-cite-evidence">{c.evidence}</p>}
                        <div className="arr-cite-actions">
                          {c.source_url && (
                            <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="arr-cite-src">
                              Source ↗
                            </a>
                          )}
                          {c.verdict !== "verified" && (
                            <button
                              type="button"
                              className="atty-comment-link"
                              onClick={() => waiveCitation(c.id, !c.waived)}
                              disabled={waivingId === c.id}
                            >
                              {waivingId === c.id ? "…" : c.waived ? "Un-waive" : "Waive (I verified this)"}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })()}

          {/* Carried over from the pre-workbench layout, which #123 replaced
              wholesale. The refactor dropped both downloads and the truncation
              warning, and none of its new panes reinstated them — an attorney
              would have lost the ability to pull the .docx and would no longer
              be told the draft they are approving was cut off mid-generation. */}
          <div className="review-workbench-docmeta">
            {doc.draft_text && (
              <div className="atty-doc-downloads">
                <a href={`/api/documents/${id}/download`} download className="atty-btn atty-btn-download">
                  Download .docx
                </a>
                <a href={`/api/documents/${id}/needed-info`} download className="atty-btn atty-btn-download">
                  Info needed
                </a>
              </div>
            )}
            {Boolean(doc.content_json?.truncated) && (
              <div className="doc-truncation-notice" role="status">
                <span className="doc-truncation-icon">⚠</span>
                <span>
                  This draft was generated from a very long document and may have been cut
                  short. Check the end of the text before approving.
                </span>
              </div>
            )}
          </div>

          <div className="review-workbench-main">
            <div className={`review-collapsible-column review-editor-column${collapsed.editor ? " is-collapsed" : ""}`}>
              <button type="button" className="review-pane-toggle" onClick={() => setCollapsed((value) => ({ ...value, editor: !value.editor }))}>{collapsed.editor ? "Show editor" : "Hide editor"}</button>
              {!collapsed.editor && <ReviewDocumentEditor title={secondDraft?.title ?? `${doc.title} — Attorney Working Copy`} text={revisionText} source={revisionSource} saveState={saveState} changes={proposedChanges} onChange={editRevision} onBlur={() => void saveRevision()}
                onAccept={(changeId) => {
                  const change = proposedChanges.find((item) => item.id === changeId); if (!change) return;
                  if (!revisionRef.current.includes(change.before)) { setChatError("That passage changed and this proposal can no longer be applied."); return; }
                  editRevision(revisionRef.current.replace(change.before, change.after)); setProposedChanges((items) => items.filter((item) => item.id !== changeId));
                }}
                onReject={(changeId) => setProposedChanges((items) => items.filter((item) => item.id !== changeId))}
                onAcceptAll={() => {
                  let next = revisionRef.current; const remaining: ReviewChange[] = [];
                  for (const change of proposedChanges) { if (next.includes(change.before)) next = next.replace(change.before, change.after); else remaining.push(change); }
                  if (next !== revisionRef.current) editRevision(next); setProposedChanges(remaining);
                }} />}
            </div>
            <div className={`review-collapsible-column review-partner-column${collapsed.partner ? " is-collapsed" : ""}`}>
              <button type="button" className="review-pane-toggle" onClick={() => setCollapsed((value) => ({ ...value, partner: !value.partner }))}>{collapsed.partner ? "Show AI partner" : "Hide AI partner"}</button>
              {!collapsed.partner && <ReviewPartnerChat messages={chatMessages} input={chatInput} sending={chatSending} disabled={isMerging} error={chatError} onInput={setChatInput} onSend={sendChatEdit} />}
            </div>
          </div>
          <div className="atty-comments-workspace">
            <h2>Comments &amp; Concerns</h2>
            <p className="atty-second-draft-hint">
              Private notes on this draft. Open comments are automatically folded into the next 2nd-draft generation. Mark a comment resolved once it&apos;s addressed to drop it from future revisions.
            </p>
            <ul className="atty-comment-list">
              {comments.length === 0 && (
                <li className="atty-comment-empty">No comments yet.</li>
              )}
              {comments.map((c) => (
                <li
                  key={c.id}
                  className={`atty-comment ${c.resolved ? "atty-comment-resolved" : ""}`}
                >
                  <span className="atty-comment-body">{c.body}</span>
                  <span className="atty-comment-actions">
                    <button
                      type="button"
                      className="atty-comment-link"
                      onClick={() => toggleCommentResolved(c)}
                    >
                      {c.resolved ? "Reopen" : "Resolve"}
                    </button>
                    <button
                      type="button"
                      className="atty-comment-link atty-comment-delete"
                      onClick={() => deleteComment(c.id)}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="atty-comment-compose">
              <textarea
                className="atty-comment-input"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={2}
                placeholder="Add a comment or concern about this draft…"
              />
              <button
                type="button"
                className="atty-btn"
                onClick={addComment}
                disabled={commentBusy || !newComment.trim()}
              >
                {commentBusy ? "Adding…" : "Add Comment"}
              </button>
            </div>
          </div>

          <div className="atty-second-draft-workspace">
            <h2>Second Draft Instructions</h2>
            <p className="atty-second-draft-hint">
              Private attorney input only — never shown to the client. Combined with the initial draft, critical review memo, open comments &amp; concerns above, and the Living File to generate a refined second draft.
            </p>
            <textarea
              className="atty-second-draft-textarea"
              value={secondDraftPrompt}
              onChange={(e) => { setSecondDraftPrompt(e.target.value); setPromptSaved(false); }}
              rows={6}
              placeholder="Add directives for the revised draft: tone changes, clauses to add/remove, facts to emphasize, risks to address…"
            />
            <div className="atty-second-draft-actions">
              <button className="atty-btn" onClick={saveSecondDraftPrompt} disabled={savingPrompt}>
                {savingPrompt ? "Saving…" : promptSaved ? "Saved ✓" : "Save Instructions"}
              </button>
              <button
                className="atty-btn atty-btn-primary"
                onClick={requestSecondDraft}
                disabled={generatingSecondDraft || !reviewText || !doc.draft_text}
                title={!reviewText ? "Run critical review first" : undefined}
              >
                {generatingSecondDraft ? "Generating 2nd Draft…" : "Generate 2nd Draft"}
              </button>
            </div>
            {fitnessWarning && (
              <div className="atty-fitness-warning">
                <strong>Document type check did not pass.</strong>
                <p>{fitnessWarning.rationale}</p>
                {fitnessWarning.recommendedType && (
                  <p>Suggested instrument: <em>{fitnessWarning.recommendedType}</em></p>
                )}
              </div>
            )}
            {secondDraftMessage && <p className="atty-second-draft-message">{secondDraftMessage}</p>}
          </div>

          <div className="atty-review-notes">
            <label htmlFor="client-notes">Notes to client (only sent if you request changes)</label>
            <textarea
              id="client-notes"
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              rows={4}
              placeholder="Explain what the client should revise…"
              disabled={submitting}
            />
          </div>

          {deliveryDraft && (
            <section className="arr-panel" aria-labelledby="delivery-composer-title">
              <div className="arr-head"><h2 id="delivery-composer-title">Client delivery composer</h2></div>
              <p className="atty-second-draft-hint">Preview and edit the exact message that will accompany the approved revision. Saving, approval, and sending are separate actions.</p>
              <div className="arr-delivery-preview">
                <p><strong>Exact attachment:</strong> <a href={`/api/documents/${deliveryDraft.revision_document_id}/download`} target="_blank" rel="noreferrer">{doc.title} — approved revision ({deliveryDraft.revision_document_id.slice(0, 8)}) ↗</a></p>
                <label>Recipient<input value={deliveryDraft.recipient} readOnly /></label>
                <label>Subject<input value={deliveryDraft.subject} onChange={(e) => setDeliveryDraft({ ...deliveryDraft, subject: e.target.value })} /></label>
                <label>Message body<textarea rows={12} value={deliveryDraft.body} onChange={(e) => setDeliveryDraft({ ...deliveryDraft, body: e.target.value })} /></label>
                <label className="arr-consult-toggle"><input type="checkbox" checked={deliveryDraft.consultation_enabled} onChange={(e) => setDeliveryDraft({ ...deliveryDraft, consultation_enabled: e.target.checked })} /> Include direct consultation scheduling CTA</label>
                {deliveryDraft.consultation_enabled && <label>Consultation link<input value={deliveryDraft.consultation_url ?? ""} onChange={(e) => setDeliveryDraft({ ...deliveryDraft, consultation_url: e.target.value })} /></label>}
                <details><summary>Structured attorney memo</summary>
                  <h4>Document purpose</h4><p>{deliveryDraft.memo.documentPurpose}</p>
                  <h4>Principal changes</h4><ul>{deliveryDraft.memo.principalChanges.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <h4>Risks or concerns</h4><ul>{deliveryDraft.memo.risksOrConcerns.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <h4>Client action items</h4><ul>{deliveryDraft.memo.clientActionItems.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <h4>Consultation offer</h4><p>{deliveryDraft.memo.consultationOffer}</p>
                </details>
                {citations.some(citationBlocksApproval) && <div className="arr-approve-block">Outstanding warning: unresolved authorities prevent approval and delivery.</div>}
              </div>
              <div className="atty-review-actions">
                <button className="atty-btn" onClick={saveDeliveryDraft} disabled={Boolean(deliveryBusy)}>{deliveryBusy === "save" ? "Saving…" : "Save message draft"}</button>
                <button className="atty-btn atty-btn-primary" onClick={() => sendDelivery(false)} disabled={Boolean(deliveryBusy) || doc.status !== "approved" || citations.some(citationBlocksApproval)}>{deliveryBusy === "send" ? "Sending…" : "Send to client"}</button>
                {doc.status !== "approved" && <button className="atty-btn atty-btn-approve" onClick={() => sendDelivery(true)} disabled={Boolean(deliveryBusy) || citations.some(citationBlocksApproval)}>{deliveryBusy === "approve-send" ? "Approving and sending…" : "Approve and send"}</button>}
              </div>
              {deliveryStatus && <p role="status">{deliveryStatus}</p>}
            </section>
          )}

          {error && <div className="atty-review-error-inline">{error}</div>}

          {(() => {
            const blocking = citations.filter(citationBlocksApproval).length;
            if (!blocking) return null;
            return (
              <div className="arr-approve-block" role="status">
                ⚠ Approval is blocked — {blocking} citation{blocking === 1 ? "" : "s"} still need to be verified, removed, or waived in the Authorities check above.
              </div>
            );
          })()}

          <div className="atty-review-actions">
            <button
              className="atty-btn atty-btn-approve"
              onClick={() => handleAction("approve")}
              disabled={submitting || citations.some(citationBlocksApproval)}
            >
              {submitting
                ? "Submitting…"
                : secondDraft?.draft_text
                  ? "Approve Revised Draft"
                  : "Approve Draft"}
            </button>
            <button
              className="atty-btn atty-btn-changes"
              onClick={() => handleAction("request_changes")}
              disabled={submitting}
            >
              Request Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
