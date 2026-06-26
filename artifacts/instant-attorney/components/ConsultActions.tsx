"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConsultRequest } from "@/lib/types";

function fmtCST(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function ConsultActions({
  consult,
  clientName,
  showCompleteHint = false,
}: {
  consult: ConsultRequest;
  clientName: string;
  /** When true, hide direct mark-complete — wrap-up panel handles completion. */
  showCompleteHint?: boolean;
}) {
  const [status, setStatus] = useState(consult.status);
  const [confirmedTime, setConfirmedTime] = useState(consult.confirmed_time);
  const [proposedTime, setProposedTime] = useState(consult.attorney_proposed_time);
  const [showPropose, setShowPropose] = useState(false);
  const [proposeInput, setProposeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function act(action: string, time?: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/consult/${consult.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, time }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Action failed");
      }
      const updated: ConsultRequest = await res.json();
      setStatus(updated.status);
      setConfirmedTime(updated.confirmed_time);
      setProposedTime(updated.attorney_proposed_time);
      setShowPropose(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  if (status === "confirmed") {
    return (
      <div className="ca-confirmed">
        <span className="ca-badge ca-badge-confirmed">Confirmed</span>
        <span className="ca-time">{confirmedTime ? fmtCST(confirmedTime) : "—"}</span>
        {!showCompleteHint && (
          <button className="ca-btn-sm ca-btn-primary" onClick={() => act("complete")} disabled={loading}>Mark complete</button>
        )}
        {showCompleteHint && (
          <span className="ca-wrap-hint">Complete via wrap-up above</span>
        )}
        <button className="ca-btn-sm ca-btn-cancel" onClick={() => act("cancel")} disabled={loading}>Cancel</button>
        {error && <div className="ca-error">{error}</div>}
      </div>
    );
  }

  if (status === "attorney_proposed") {
    return (
      <div className="ca-confirmed">
        <span className="ca-badge ca-badge-proposed">Awaiting Client</span>
        <span className="ca-time">{proposedTime ? fmtCST(proposedTime) : "—"}</span>
        <button className="ca-btn-sm ca-btn-cancel" onClick={() => act("cancel")} disabled={loading}>Cancel request</button>
        {error && <div className="ca-error">{error}</div>}
      </div>
    );
  }

  if (status === "cancelled" || status === "completed") {
    return <span className={`ca-badge ca-badge-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
  }

  return (
    <div className="ca-actions">
      <div className="ca-confirm-options">
        <span className="ca-actions-label">Confirm one of the client&apos;s times:</span>
        <div className="ca-time-btns">
          {consult.proposed_times.map((t, i) => (
            <button
              key={t}
              type="button"
              className="ca-btn-time"
              onClick={() => act("confirm", t)}
              disabled={loading}
            >
              {i + 1}. {fmtCST(t)}
            </button>
          ))}
        </div>
      </div>

      <div className="ca-divider-or">or</div>

      {showPropose ? (
        <div className="ca-propose-form">
          <label className="ca-propose-label">Propose a different time (CST):</label>
          <input
            type="datetime-local"
            className="ca-propose-input"
            value={proposeInput}
            onChange={e => setProposeInput(e.target.value)}
          />
          <div className="ca-propose-actions">
            <button
              type="button"
              className="ca-btn ca-btn-primary"
              disabled={!proposeInput || loading}
              onClick={() => {
                // Convert local datetime-local input to UTC ISO
                const d = new Date(proposeInput);
                act("propose", d.toISOString());
              }}
            >
              Send Proposal
            </button>
            <button type="button" className="ca-btn ca-btn-ghost" onClick={() => setShowPropose(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="ca-btn ca-btn-secondary" onClick={() => setShowPropose(true)} disabled={loading}>
          Propose a Different Time
        </button>
      )}

      {error && <div className="ca-error">{error}</div>}
    </div>
  );
}
