"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONSULT_DISPOSITION_LABELS,
  emptyWrapUp,
  newActionId,
  normalizeWrapUp,
} from "@/lib/consult-wrap-up";
import type { ConsultActionItem, ConsultDisposition, ConsultRequestStatus, ConsultWrapUp } from "@/lib/types";

function ActionList({
  label,
  items,
  onChange,
  disabled,
}: {
  label: string;
  items: ConsultActionItem[];
  onChange: (items: ConsultActionItem[]) => void;
  disabled?: boolean;
}) {
  function updateItem(index: number, patch: Partial<ConsultActionItem>) {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function addItem() {
    onChange([...items, { id: newActionId(), text: "", kind: "general" }]);
  }

  return (
    <div className="cb-wrap-block">
      <div className="cb-wrap-block-header">
        <span className="cb-block-title">{label}</span>
        {!disabled && (
          <button type="button" className="cb-add-btn" onClick={addItem}>
            + Add item
          </button>
        )}
      </div>
      {items.length === 0 && (
        <p className="cb-wrap-hint">No items yet — add action steps from the consult.</p>
      )}
      {items.map((item, index) => (
        <div key={item.id} className="cb-action-row">
          <input
            type="text"
            className="cb-action-input"
            placeholder="Describe the action…"
            value={item.text}
            disabled={disabled}
            onChange={(e) => updateItem(index, { text: e.target.value })}
          />
          <select
            className="cb-action-kind"
            value={item.kind}
            disabled={disabled}
            onChange={(e) => updateItem(index, { kind: e.target.value as ConsultActionItem["kind"] })}
          >
            <option value="general">General</option>
            <option value="document">Document upload</option>
          </select>
          {!disabled && (
            <button type="button" className="cb-remove-btn" onClick={() => removeItem(index)} aria-label="Remove">
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ConsultWrapUpSection({
  consultId,
  consultStatus,
  appliedWrapUp,
  appliedSeq,
}: {
  consultId: string;
  consultStatus: ConsultRequestStatus;
  appliedWrapUp?: ConsultWrapUp | null;
  appliedSeq?: number;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [attorneyNotes, setAttorneyNotes] = useState("");
  const [wrapUp, setWrapUp] = useState<ConsultWrapUp>(emptyWrapUp());
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [error, setError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompleted = consultStatus === "completed" || Boolean(submittedAt);
  const isReadOnly = isCompleted;

  const loadWrapUp = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/wrap-up`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to load wrap-up");
      }
      const data = await res.json();
      setAttorneyNotes(data.attorneyNotes ?? "");
      setWrapUp(normalizeWrapUp(data.wrapUp));
      setSubmittedAt(data.submittedAt ?? null);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load wrap-up");
    }
  }, [consultId]);

  useEffect(() => {
    void loadWrapUp();
  }, [loadWrapUp]);

  const persistDraft = useCallback(async (notes: string, draft: ConsultWrapUp) => {
    if (isReadOnly) return;
    setSaving(true);
    setSaveLabel("Saving…");
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/wrap-up`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attorneyNotes: notes, wrapUp: draft }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      setSaveLabel("Saved");
      setTimeout(() => setSaveLabel(""), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [consultId, isReadOnly]);

  useEffect(() => {
    if (!appliedWrapUp || !appliedSeq || isReadOnly) return;
    const next = normalizeWrapUp(appliedWrapUp);
    setWrapUp(next);
    void persistDraft(attorneyNotes, next);
  }, [appliedSeq, appliedWrapUp, attorneyNotes, isReadOnly, persistDraft]);

  function scheduleSave(notes: string, draft: ConsultWrapUp) {
    if (isReadOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persistDraft(notes, draft);
    }, 1500);
  }

  function updateNotes(value: string) {
    setAttorneyNotes(value);
    scheduleSave(value, wrapUp);
  }

  function updateWrapUp(next: ConsultWrapUp) {
    setWrapUp(next);
    scheduleSave(attorneyNotes, next);
  }

  async function submitWrapUp() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/wrap-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attorneyNotes, wrapUp }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Submit failed");
      }
      const data = await res.json();
      setSubmittedAt(data.consult?.wrap_up_submitted_at ?? new Date().toISOString());
      setWrapUp(normalizeWrapUp(data.consult?.post_consult_plan ?? wrapUp));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded && !error) {
    return <div className="atty-ai-running">Loading wrap-up form…</div>;
  }

  return (
    <div className="cb-wrap">
      {isCompleted && (
        <div className="cb-wrap-submitted">
          Wrap-up submitted{submittedAt ? ` · ${new Date(submittedAt).toLocaleString()}` : ""}
        </div>
      )}

      <div className="cb-wrap-block">
        <div className="cb-block-title">Call notes</div>
        <p className="cb-wrap-hint">Type freely during the consult — saves automatically.</p>
        <textarea
          className="cb-wrap-textarea"
          rows={4}
          placeholder="Key points discussed, client concerns, facts confirmed on the call…"
          value={attorneyNotes}
          disabled={isReadOnly}
          onChange={(e) => updateNotes(e.target.value)}
        />
      </div>

      <div className="cb-wrap-block">
        <div className="cb-block-title">Consult summary (client-facing)</div>
        <p className="cb-wrap-hint">2–4 sentences the client will see on their file after you submit.</p>
        <textarea
          className="cb-wrap-textarea"
          rows={3}
          placeholder="What was discussed and what it means for the client's matter…"
          value={wrapUp.consultSummary}
          disabled={isReadOnly}
          onChange={(e) => updateWrapUp({ ...wrapUp, consultSummary: e.target.value })}
        />
      </div>

      <div className="cb-wrap-block">
        <div className="cb-block-title">Disposition</div>
        <select
          className="cb-wrap-select"
          value={wrapUp.disposition}
          disabled={isReadOnly}
          onChange={(e) => updateWrapUp({ ...wrapUp, disposition: e.target.value as ConsultDisposition | "" })}
        >
          <option value="">Select outcome…</option>
          {(Object.entries(CONSULT_DISPOSITION_LABELS) as [ConsultDisposition, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {wrapUp.disposition === "refer_out" && (
        <div className="cb-wrap-block">
          <div className="cb-block-title">Referral notes</div>
          <textarea
            className="cb-wrap-textarea"
            rows={2}
            placeholder="Who to contact, why, and what the client should expect…"
            value={wrapUp.referralNotes}
            disabled={isReadOnly}
            onChange={(e) => updateWrapUp({ ...wrapUp, referralNotes: e.target.value })}
          />
        </div>
      )}

      <ActionList
        label="Client to-dos"
        items={wrapUp.clientActions}
        onChange={(clientActions) => updateWrapUp({ ...wrapUp, clientActions })}
        disabled={isReadOnly}
      />

      <ActionList
        label="Attorney to-dos"
        items={wrapUp.attorneyActions}
        onChange={(attorneyActions) => updateWrapUp({ ...wrapUp, attorneyActions })}
        disabled={isReadOnly}
      />

      {error && <p className="atty-ai-error">{error}</p>}

      {!isReadOnly && (
        <div className="cb-wrap-actions">
          <button
            type="button"
            className="atty-ai-btn"
            onClick={() => void persistDraft(attorneyNotes, wrapUp)}
            disabled={saving || submitting}
          >
            {saveLabel || "Save draft"}
          </button>
          <button
            type="button"
            className="atty-ai-btn atty-ai-btn-full"
            onClick={() => void submitWrapUp()}
            disabled={saving || submitting}
          >
            {submitting ? "Submitting…" : "Submit wrap-up & mark complete"}
          </button>
        </div>
      )}
    </div>
  );
}
