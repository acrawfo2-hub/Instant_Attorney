"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function ConsultStatusCard({ consult: initial }: { consult: ConsultRequest }) {
  const router = useRouter();
  const [consult, setConsult] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "accept" | "decline") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/consult/${consult.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setConsult(data as ConsultRequest);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (consult.status === "cancelled" || consult.status === "completed") return null;

  const cardClass = [
    "consult-status-card",
    consult.status === "confirmed" ? "consult-status-confirmed" : "",
    consult.status === "pending" ? "consult-status-pending" : "",
    consult.status === "attorney_proposed" ? "consult-status-proposed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div id="consult-status" className={cardClass}>
      <span className="consult-status-icon" aria-hidden>
        {consult.status === "confirmed" ? "✓" : consult.status === "attorney_proposed" ? "↻" : "⏳"}
      </span>
      <div className="consult-status-body">
        {consult.status === "confirmed" && consult.confirmed_time && (
          <>
            <div className="consult-status-title">Consult confirmed</div>
            <div className="consult-status-detail">
              <strong>{fmtCST(consult.confirmed_time)}</strong>
              {consult.client_phone && <> · Andrew will call you at {consult.client_phone}</>}
            </div>
            <Link href={`/consult/${consult.id}/session`} className="consult-status-btn consult-status-btn-accept">
              Open consult page →
            </Link>
          </>
        )}

        {consult.status === "pending" && (
          <>
            <div className="consult-status-title">Awaiting attorney confirmation</div>
            <div className="consult-status-detail">
              Your 3 preferred times were submitted. Andrew will confirm one shortly.
            </div>
            <ul className="consult-status-times">
              {consult.proposed_times.map((t, i) => (
                <li key={t}>{i + 1}. {fmtCST(t)}</li>
              ))}
            </ul>
          </>
        )}

        {consult.status === "attorney_proposed" && consult.attorney_proposed_time && (
          <>
            <div className="consult-status-title">New time proposed</div>
            <div className="consult-status-detail">
              Andrew suggested <strong>{fmtCST(consult.attorney_proposed_time)}</strong>.
              Accept to confirm, or decline to pick new times.
            </div>
            <div className="consult-status-actions">
              <button
                type="button"
                className="consult-status-btn consult-status-btn-accept"
                disabled={loading}
                onClick={() => act("accept")}
              >
                {loading ? "…" : "Accept this time"}
              </button>
              <button
                type="button"
                className="consult-status-btn consult-status-btn-decline"
                disabled={loading}
                onClick={() => act("decline")}
              >
                Decline
              </button>
            </div>
            {error && <div className="consult-status-error">{error}</div>}
            <p className="consult-status-hint">
              Declining cancels this request — you can{" "}
              <Link href="/consult/schedule" className="dash-status-link">submit new times</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
