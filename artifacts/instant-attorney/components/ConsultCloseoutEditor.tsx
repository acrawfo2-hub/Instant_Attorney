"use client";

import { useEffect, useState } from "react";
import {
  CONSULT_DISPOSITION_LABELS,
  emptyWrapUp,
  newActionId,
  normalizeWrapUp,
  validateWrapUpForSubmit,
} from "@/lib/consult-wrap-up";
import type { ConsultActionItem, ConsultActionKind, ConsultWrapUp } from "@/lib/types";

interface Props {
  consultId: string;
  initialWrapUp: ConsultWrapUp | null;
  /** True once the report has already been sent — the form goes read-only. */
  alreadySent: boolean;
  submittedAt: string | null;
  appliedWrapUp?: ConsultWrapUp | null;
  appliedSeq?: number;
}

function ActionListEditor({
  label,
  placeholder,
  items,
  onChange,
  showKind,
  readOnly,
}: {
  label: string;
  placeholder: string;
  items: ConsultActionItem[];
  onChange: (items: ConsultActionItem[]) => void;
  showKind: boolean;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newActionId(), text, kind: "general" }]);
    setDraft("");
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }

  function updateText(id: string, text: string) {
    onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));
  }

  function updateKind(id: string, kind: ConsultActionKind) {
    onChange(items.map((i) => (i.id === id ? { ...i, kind } : i)));
  }

  return (
    <div className="lf-closeout-field">
      <div className="lf-card-label">{label}</div>
      {items.map((item) => (
        <div key={item.id} className="lf-closeout-list-row">
          <input
            className="lf-closeout-input"
            value={item.text}
            onChange={(e) => updateText(item.id, e.target.value)}
            disabled={readOnly}
          />
          {showKind && (
            <select
              className="lf-closeout-input lf-closeout-kind"
              value={item.kind}
              onChange={(e) => updateKind(item.id, e.target.value as ConsultActionKind)}
              disabled={readOnly}
            >
              <option value="general">General</option>
              <option value="document">Document upload</option>
            </select>
          )}
          {!readOnly && (
            <button className="lf-expand-btn" onClick={() => remove(item.id)}>
              Remove
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="lf-closeout-list-row">
          <input
            className="lf-closeout-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
          />
          <button className="atty-btn" onClick={add} disabled={!draft.trim()}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export default function ConsultCloseoutEditor({
  consultId, initialWrapUp, alreadySent, submittedAt, appliedWrapUp, appliedSeq,
}: Props) {
  const [wrapUp, setWrapUp] = useState<ConsultWrapUp>(initialWrapUp ? normalizeWrapUp(initialWrapUp) : emptyWrapUp());
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(alreadySent);
  const [sentAt, setSentAt] = useState(submittedAt);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const readOnly = sent;

  useEffect(() => {
    if (!appliedWrapUp || !appliedSeq || readOnly) return;
    setWrapUp(normalizeWrapUp(appliedWrapUp));
    void (async () => {
      try {
        const res = await fetch(`/api/attorney/consult/${consultId}/wrap-up`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wrapUp: appliedWrapUp }),
        });
        if (!res.ok) return;
        setNotice("Associate draft applied — review before sending.");
      } catch {
        /* save is best-effort; the editor still shows the applied text */
      }
    })();
  }, [appliedSeq, appliedWrapUp, consultId, readOnly]);

  function update<K extends keyof ConsultWrapUp>(key: K, value: ConsultWrapUp[K]) {
    setWrapUp((prev) => ({ ...prev, [key]: value }));
  }

  async function generateDraft() {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/closeout/generate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to generate draft");
      setWrapUp(normalizeWrapUp(data.wrapUp));
      setNotice("Draft generated — review and edit before sending.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate draft");
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/wrap-up`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wrapUp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save draft");
      setNotice("Draft saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  async function sendToClient() {
    setError(null);
    setNotice(null);
    const validation = validateWrapUpForSubmit(wrapUp);
    if (!validation.ok) {
      setError(validation.errors.join(" "));
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/wrap-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wrapUp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send report");
      setSent(true);
      setSentAt(new Date().toISOString());
      setNotice("Sent to the client.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send report");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="lf-card lf-card-full">
      <div className="lf-closeout-header">
        <div className="lf-card-label">Consult closeout report</div>
        {sent ? (
          <span className="lf-consult-rec-badge lf-consult-rec-badge-confirmed">
            Sent to client{sentAt ? ` · ${new Date(sentAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}
          </span>
        ) : (
          <button className="atty-btn" disabled={generating} onClick={generateDraft}>
            {generating ? "Generating…" : "Generate draft"}
          </button>
        )}
      </div>

      {!sent && (
        <p className="lf-card-meta" style={{ marginBottom: "0.85rem" }}>
          Drafted from your notes and the recording&apos;s transcript, when available. Review and edit everything below before sending — nothing goes to the client until you click Send.
        </p>
      )}

      <div className="lf-closeout-field">
        <div className="lf-card-label">Summary</div>
        <textarea
          className="atty-second-draft-textarea"
          rows={3}
          value={wrapUp.consultSummary}
          onChange={(e) => update("consultSummary", e.target.value)}
          disabled={readOnly}
          placeholder="What was discussed and the bottom line for the client…"
        />
      </div>

      <div className="lf-closeout-field">
        <div className="lf-card-label">Strategy overview — where we&apos;re at</div>
        <textarea
          className="atty-second-draft-textarea"
          rows={3}
          value={wrapUp.strategyOverview}
          onChange={(e) => update("strategyOverview", e.target.value)}
          disabled={readOnly}
          placeholder="Plain-language recap of the strategy and where the matter stands…"
        />
      </div>

      <div className="lf-closeout-field">
        <div className="lf-card-label">Disposition</div>
        <select
          className="lf-closeout-input"
          value={wrapUp.disposition}
          onChange={(e) => update("disposition", e.target.value as ConsultWrapUp["disposition"])}
          disabled={readOnly}
        >
          <option value="">Select…</option>
          {Object.entries(CONSULT_DISPOSITION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {wrapUp.disposition === "refer_out" && (
        <div className="lf-closeout-field">
          <div className="lf-card-label">Referral notes</div>
          <textarea
            className="atty-second-draft-textarea"
            rows={2}
            value={wrapUp.referralNotes}
            onChange={(e) => update("referralNotes", e.target.value)}
            disabled={readOnly}
            placeholder="Who the client is being referred to and why…"
          />
        </div>
      )}

      <div className="lf-closeout-field">
        <div className="lf-card-label">Expected timeline</div>
        <textarea
          className="atty-second-draft-textarea"
          rows={2}
          value={wrapUp.expectedTimeline}
          onChange={(e) => update("expectedTimeline", e.target.value)}
          disabled={readOnly}
          placeholder="What happens next and roughly when…"
        />
      </div>

      <ActionListEditor
        label="Documents to expect"
        placeholder="A document the client should expect to receive from the firm…"
        items={wrapUp.expectedDocuments}
        onChange={(items) => update("expectedDocuments", items)}
        showKind={false}
        readOnly={readOnly}
      />

      <ActionListEditor
        label="Client action items"
        placeholder="Something the client needs to do…"
        items={wrapUp.clientActions}
        onChange={(items) => update("clientActions", items)}
        showKind
        readOnly={readOnly}
      />

      <ActionListEditor
        label="Attorney action items"
        placeholder="Something Andrew needs to do…"
        items={wrapUp.attorneyActions}
        onChange={(items) => update("attorneyActions", items)}
        showKind
        readOnly={readOnly}
      />

      {notice && <div className="lf-card-meta">{notice}</div>}
      {error && <div className="lf-session-error">{error}</div>}

      {!sent && (
        <div className="atty-second-draft-actions" style={{ marginTop: "0.85rem" }}>
          <button className="atty-btn" disabled={saving} onClick={saveDraft}>
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button className="atty-btn atty-btn-primary" disabled={sending} onClick={sendToClient}>
            {sending ? "Sending…" : "Send to client"}
          </button>
        </div>
      )}
    </div>
  );
}
