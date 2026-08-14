"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  SupportTicketRow,
  TicketPriority,
  TicketStatus,
} from "@/lib/admin/support-desk";

const STATUS_LABELS: Record<TicketStatus, string> = {
  new: "New",
  in_progress: "In progress",
  waiting: "Waiting on client",
  resolved: "Resolved",
  closed: "Closed",
};

export default function SupportQueue({
  initialTickets,
}: {
  initialTickets: SupportTicketRow[];
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const visible = useMemo(
    () =>
      filter === "all"
        ? tickets
        : tickets.filter(
            (ticket) => !["resolved", "closed"].includes(ticket.status),
          ),
    [tickets, filter],
  );

  return (
    <>
      <div className="admin-support-toolbar">
        <div className="admin-support-summary">
          <strong>
            {tickets.filter((ticket) => ticket.status === "new").length}
          </strong>{" "}
          new <span>·</span>{" "}
          <strong>
            {
              tickets.filter(
                (ticket) =>
                  ticket.priority === "urgent" &&
                  !["resolved", "closed"].includes(ticket.status),
              ).length
            }
          </strong>{" "}
          urgent
        </div>
        <div>
          <button
            className={
              filter === "open" ? "admin-btn admin-btn-primary" : "admin-btn"
            }
            onClick={() => setFilter("open")}
          >
            Open
          </button>{" "}
          <button
            className={
              filter === "all" ? "admin-btn admin-btn-primary" : "admin-btn"
            }
            onClick={() => setFilter("all")}
          >
            All
          </button>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="admin-empty">No tickets in this view.</div>
      ) : (
        <div className="admin-ticket-list">
          {visible.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onUpdated={(patch) =>
                setTickets((current) =>
                  current.map((row) =>
                    row.id === ticket.id ? { ...row, ...patch } : row,
                  ),
                )
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

function TicketCard({
  ticket,
  onUpdated,
}: {
  ticket: SupportTicketRow;
  onUpdated: (patch: Partial<SupportTicketRow>) => void;
}) {
  const [open, setOpen] = useState(ticket.status === "new");
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [notes, setNotes] = useState(ticket.admin_notes ?? "");
  const [resolution, setResolution] = useState(ticket.resolution_summary ?? "");
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    setResult("");
    const response = await fetch(`/api/admin/support/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        priority,
        adminNotes: notes,
        resolutionSummary: resolution,
      }),
    });
    const body = await response.json();
    if (!response.ok) setResult(body.error ?? "Update failed.");
    else {
      onUpdated({
        status,
        priority,
        admin_notes: notes,
        resolution_summary: resolution,
        updated_at: body.ticket.updated_at,
      });
      setResult("Saved and added to the admin audit trail.");
    }
    setSaving(false);
  }
  return (
    <article className={`admin-ticket admin-ticket-${priority}`}>
      <button
        className="admin-ticket-header"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div>
          <span className="admin-ticket-number">IA-{ticket.ticket_number}</span>
          <span className={`admin-badge admin-ticket-priority-${priority}`}>
            {priority}
          </span>
          <span className="admin-badge">{STATUS_LABELS[ticket.status]}</span>
          <h2>{ticket.subject}</h2>
          <p>
            {ticket.requester_email} · {ticket.category.replaceAll("_", " ")} ·{" "}
            {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="admin-ticket-body">
          <div className="admin-ticket-description">{ticket.description}</div>
          <div className="admin-ticket-actions">
            {ticket.user_id ? (
              <Link
                className="admin-btn admin-btn-primary"
                href={`/admin/people?id=${ticket.user_id}`}
              >
                Diagnose account →
              </Link>
            ) : (
              <span className="admin-note">
                No profile match—search the email in People.
              </span>
            )}{" "}
            {ticket.page_path && (
              <span className="admin-note">
                Reported from <code>{ticket.page_path}</code>
              </span>
            )}
          </div>
          <div className="admin-ticket-fields">
            <label className="admin-field">
              Priority
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TicketPriority)
                }
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="admin-field">
              Status
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as TicketStatus)
                }
              >
                <option value="new">New</option>
                <option value="in_progress">In progress</option>
                <option value="waiting">Waiting on client</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </label>
          </div>
          <label className="admin-field">
            Internal notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Diagnosis, steps attempted, and follow-up needed. Never paste passwords."
            />
          </label>
          <label className="admin-field">
            Resolution summary{" "}
            {(status === "resolved" || status === "closed") && "(required)"}
            <textarea
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder="What fixed the issue and what the client should do next."
            />
          </label>
          <button
            className="admin-btn admin-btn-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save ticket"}
          </button>
          {result && <p className="admin-note">{result}</p>}
        </div>
      )}
    </article>
  );
}
