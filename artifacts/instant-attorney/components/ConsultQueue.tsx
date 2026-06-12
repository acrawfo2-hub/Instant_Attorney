"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Consult, CaseFile, Profile, ConsultType } from "@/lib/types";

type ConsultRow = Consult & {
  profiles: Profile | null;
  case_files: CaseFile | null;
};

export interface CaseOption {
  id: string;          // case_file id
  user_id: string;
  client_name: string;
  matter: string;
}

const TYPE_LABELS: Record<ConsultType, string> = {
  standard: "Consult",
  quick_consult: "Quick Consult",
  follow_up: "Follow-up",
};

function clientName(c: ConsultRow) {
  return c.profiles?.full_name ?? c.profiles?.email ?? "Unknown client";
}

function matterLabel(c: ConsultRow) {
  const cf = c.case_files;
  if (!cf) return "—";
  const t = cf.matter_type ?? "Unclassified";
  return cf.matter_subtype ? `${t} — ${cf.matter_subtype}` : t;
}

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// datetime-local needs "YYYY-MM-DDTHH:mm" in local time
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function ConsultQueue({
  initialConsults,
  caseOptions,
}: {
  initialConsults: ConsultRow[];
  caseOptions: CaseOption[];
}) {
  const router = useRouter();
  const [consults, setConsults] = useState<ConsultRow[]>(initialConsults);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Reconcile with fresh server data after router.refresh() (e.g. a new consult
  // gains its joined client name / matter once the server re-fetches).
  useEffect(() => { setConsults(initialConsults); }, [initialConsults]);

  const needsScheduling = consults.filter((c) => c.status === "needs_scheduling");
  const upcoming = consults
    .filter((c) => c.status === "scheduled")
    .sort((a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime());

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/attorney/consults/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.consult) {
        setConsults((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...data.consult } : c)),
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/attorney/consults/${id}`, { method: "DELETE" });
      if (res.ok) setConsults((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (!consults.length && !adding) {
    return (
      <div className="atty-consult-empty">
        <span className="atty-empty">No consults yet</span>
        <button className="atty-btn-sm" onClick={() => setAdding(true)}>+ Add consult</button>
      </div>
    );
  }

  return (
    <div className="atty-consults">
      {/* Needs scheduling */}
      <div className="atty-consult-group">
        <div className="atty-consult-group-title">
          Needs scheduling
          {needsScheduling.length > 0 && <span className="atty-count">{needsScheduling.length}</span>}
        </div>
        {needsScheduling.length === 0 ? (
          <div className="atty-empty">Nothing waiting to be scheduled</div>
        ) : (
          <table className="atty-table">
            <thead>
              <tr><th>Client</th><th>Matter</th><th>Type</th><th>Schedule</th><th /></tr>
            </thead>
            <tbody>
              {needsScheduling.map((c) => (
                <ScheduleRow key={c.id} c={c} busy={busyId === c.id} onSchedule={patch} onRemove={remove} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upcoming / on the schedule */}
      <div className="atty-consult-group">
        <div className="atty-consult-group-title">
          On the schedule
          {upcoming.length > 0 && <span className="atty-count">{upcoming.length}</span>}
        </div>
        {upcoming.length === 0 ? (
          <div className="atty-empty">No upcoming consults</div>
        ) : (
          <table className="atty-table">
            <thead>
              <tr><th>When</th><th>Client</th><th>Matter</th><th>Type</th><th /></tr>
            </thead>
            <tbody>
              {upcoming.map((c) => (
                <tr key={c.id}>
                  <td className="atty-td-when">{fmtWhen(c.scheduled_at)}</td>
                  <td>
                    <button className="atty-client-link" onClick={() => router.push(`/attorney/client/${c.user_id}`)}>
                      {clientName(c)}
                    </button>
                  </td>
                  <td className="atty-td-matter">{matterLabel(c)}</td>
                  <td className="atty-td-muted">{TYPE_LABELS[c.consult_type]}</td>
                  <td className="atty-td-actions">
                    <button className="atty-btn-sm" disabled={busyId === c.id}
                      onClick={() => patch(c.id, { status: "completed" })}>Done</button>
                    <button className="atty-btn-sm atty-btn-ghost" disabled={busyId === c.id}
                      onClick={() => patch(c.id, { status: "needs_scheduling", scheduled_at: null })}>Reschedule</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding ? (
        <AddConsultForm
          caseOptions={caseOptions}
          onCancel={() => setAdding(false)}
          onCreated={(c) => { setConsults((p) => [c, ...p]); setAdding(false); router.refresh(); }}
        />
      ) : (
        <button className="atty-btn-sm" onClick={() => setAdding(true)}>+ Add consult</button>
      )}
    </div>
  );
}

function ScheduleRow({
  c, busy, onSchedule, onRemove,
}: {
  c: ConsultRow;
  busy: boolean;
  onSchedule: (id: string, body: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();
  const [when, setWhen] = useState(toLocalInput(c.scheduled_at));

  return (
    <tr>
      <td>
        <button className="atty-client-link" onClick={() => router.push(`/attorney/client/${c.user_id}`)}>
          {clientName(c)}
        </button>
      </td>
      <td className="atty-td-matter">{matterLabel(c)}</td>
      <td className="atty-td-muted">{TYPE_LABELS[c.consult_type]}</td>
      <td className="atty-td-schedule">
        <input
          type="datetime-local"
          className="atty-input-sm"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <button
          className="atty-btn-sm atty-btn-primary"
          disabled={busy || !when}
          onClick={() => onSchedule(c.id, { scheduled_at: new Date(when).toISOString() })}
        >
          {busy ? "…" : "Schedule"}
        </button>
      </td>
      <td className="atty-td-actions">
        <button className="atty-btn-sm atty-btn-ghost" disabled={busy} onClick={() => onRemove(c.id)}>Cancel</button>
      </td>
    </tr>
  );
}

function AddConsultForm({
  caseOptions, onCancel, onCreated,
}: {
  caseOptions: CaseOption[];
  onCancel: () => void;
  onCreated: (c: ConsultRow) => void;
}) {
  const [caseId, setCaseId] = useState(caseOptions[0]?.id ?? "");
  const [type, setType] = useState<ConsultType>("standard");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const opt = caseOptions.find((o) => o.id === caseId);
    if (!opt) { setError("Select a client / case file"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/attorney/consults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: opt.user_id,
          case_file_id: opt.id,
          consult_type: type,
          scheduled_at: when ? new Date(when).toISOString() : null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create consult"); return; }
      onCreated(data.consult as ConsultRow);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="atty-add-consult">
      <div className="atty-add-row">
        <label>
          Client / matter
          <select className="atty-input-sm" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            {caseOptions.length === 0 && <option value="">No open case files</option>}
            {caseOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.client_name} — {o.matter}</option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select className="atty-input-sm" value={type} onChange={(e) => setType(e.target.value as ConsultType)}>
            <option value="standard">Consult</option>
            <option value="quick_consult">Quick Consult</option>
            <option value="follow_up">Follow-up</option>
          </select>
        </label>
        <label>
          When (optional)
          <input type="datetime-local" className="atty-input-sm" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
      </div>
      <label className="atty-add-notes">
        Notes (optional)
        <input className="atty-input-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason / context" />
      </label>
      {error && <div className="atty-review-error-inline">{error}</div>}
      <div className="atty-add-actions">
        <button className="atty-btn-sm atty-btn-primary" disabled={saving || !caseId} onClick={submit}>
          {saving ? "Saving…" : "Add consult"}
        </button>
        <button className="atty-btn-sm atty-btn-ghost" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
