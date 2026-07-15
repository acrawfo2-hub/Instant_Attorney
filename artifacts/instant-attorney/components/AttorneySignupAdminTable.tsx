"use client";

import { useCallback, useState } from "react";

export interface AttorneySignupRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  bar_number: string | null;
  firm_name: string | null;
  attorney_user_status: "pending" | "approved" | "rejected" | null;
  created_at: string;
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString();

function statusColor(status: string | null): string {
  if (status === "approved") return "#15803d";
  if (status === "rejected") return "#991b1b";
  return "#b45309";
}

const btn: React.CSSProperties = {
  fontSize: 12, padding: "4px 9px", borderRadius: 6, border: "1px solid #cbd5e1",
  background: "#fff", cursor: "pointer", whiteSpace: "nowrap",
};

export default function AttorneySignupAdminTable({ initial }: { initial: AttorneySignupRow[] }) {
  const [rows, setRows] = useState<AttorneySignupRow[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/attorney-signups", { cache: "no-store" });
    if (res.ok) setRows((await res.json()).signups ?? []);
  }, []);

  const decide = useCallback(async (row: AttorneySignupRow, decision: "approved" | "rejected") => {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/attorney-signups/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.id, decision }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Couldn't ${decision === "approved" ? "approve" : "reject"} ${row.full_name ?? row.email}: ${body.error ?? `HTTP ${res.status}`}`);
        return;
      }
      await refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
        <button style={btn} disabled={!!busy} onClick={refresh}>Refresh</button>
      </div>
      {error && (
        <p style={{ fontSize: 12.5, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 10px", margin: "0 0 10px" }}>
          {error}
        </p>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
            <th style={{ padding: "6px 8px" }}>Name</th>
            <th style={{ padding: "6px 8px" }}>Firm / Bar #</th>
            <th style={{ padding: "6px 8px" }}>Contact</th>
            <th style={{ padding: "6px 8px" }}>Status</th>
            <th style={{ padding: "6px 8px" }}>Applied</th>
            <th style={{ padding: "6px 8px" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 16, color: "#94a3b8" }}>No attorney-user signups yet.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "6px 8px" }}>{r.full_name ?? "—"}</td>
              <td style={{ padding: "6px 8px" }}>
                {r.firm_name ?? <span style={{ color: "#94a3b8" }}>(no firm)</span>}
                <div style={{ color: "#94a3b8", fontSize: 11 }}>{r.bar_number ?? "no bar # given"}</div>
              </td>
              <td style={{ padding: "6px 8px" }}>
                {r.email}
                <div style={{ color: "#94a3b8", fontSize: 11 }}>{r.phone ?? "—"}</div>
              </td>
              <td style={{ padding: "6px 8px", color: statusColor(r.attorney_user_status), fontWeight: 600 }}>
                {r.attorney_user_status ?? "pending"}
              </td>
              <td style={{ padding: "6px 8px" }}>{fmtDate(r.created_at)}</td>
              <td style={{ padding: "6px 8px" }}>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <button
                    style={{ ...btn, color: "#15803d", borderColor: "#bbf7d0" }}
                    disabled={busy === r.id || r.attorney_user_status === "approved"}
                    onClick={() => decide(r, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    style={{ ...btn, color: "#991b1b", borderColor: "#fecaca" }}
                    disabled={busy === r.id || r.attorney_user_status === "rejected"}
                    onClick={() => decide(r, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
