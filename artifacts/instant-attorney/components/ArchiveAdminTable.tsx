"use client";

import { useCallback, useState } from "react";

export interface ArchiveRow {
  id: string;
  case_file_id: string;
  user_email: string | null;
  matter_title: string | null;
  matter_type: string | null;
  file_type: string | null;
  document_count: number;
  attachment_count: number;
  size_bytes: number;
  category: string | null;
  legal_hold: boolean;
  archived_at: string;
  retention_until: string | null;
  destruction_notice_sent_at: string | null;
  destroyed_at: string | null;
}

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1_048_576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1_048_576).toFixed(1)} MB`);

function status(r: ArchiveRow): { label: string; color: string } {
  if (r.destroyed_at) return { label: "Destroyed", color: "#991b1b" };
  if (r.legal_hold) return { label: "Legal hold", color: "#92400e" };
  if (r.destruction_notice_sent_at) return { label: "Destruction noticed", color: "#b45309" };
  if (r.retention_until && new Date(r.retention_until) <= new Date()) return { label: "Past retention", color: "#b45309" };
  if (!r.retention_until) return { label: "Retained (indefinite)", color: "#15803d" };
  return { label: "Retained", color: "#15803d" };
}

const btn: React.CSSProperties = {
  fontSize: 12, padding: "4px 9px", borderRadius: 6, border: "1px solid #cbd5e1",
  background: "#fff", cursor: "pointer", whiteSpace: "nowrap",
};

export default function ArchiveAdminTable({ initial }: { initial: ArchiveRow[] }) {
  const [rows, setRows] = useState<ArchiveRow[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/archives?pageSize=100", { cache: "no-store" });
    if (res.ok) setRows((await res.json()).archives ?? []);
  }, []);

  const runSweep = useCallback(async (path: string, label: string) => {
    setBusy(label); setMsg(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const body = await res.json();
      setMsg(`${label}: ${JSON.stringify(body).slice(0, 300)}`);
      await refresh();
    } finally { setBusy(null); }
  }, [refresh]);

  const download = useCallback((id: string) => {
    // Streams the decrypted, integrity-verified bundle as a JSON file.
    window.location.href = `/api/admin/archives/${id}?download=1`;
  }, []);

  const toggleHold = useCallback(async (r: ArchiveRow) => {
    setBusy(r.id);
    try {
      await fetch("/api/admin/archives/hold", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveId: r.id, hold: !r.legal_hold }),
      });
      await refresh();
    } finally { setBusy(null); }
  }, [refresh]);

  const destroy = useCallback(async (r: ArchiveRow) => {
    if (!confirm(`Permanently destroy the archive for ${r.matter_title ?? r.case_file_id}? This cannot be undone.`)) return;
    setBusy(r.id); setMsg(null);
    try {
      const res = await fetch(`/api/admin/archives/${r.id}/destroy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await res.json();
      if (!res.ok) setMsg(`Destroy blocked: ${body.reason ?? body.error}`);
      await refresh();
    } finally { setBusy(null); }
  }, [refresh]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
        <button style={{ ...btn, fontWeight: 600 }} disabled={!!busy}
          onClick={() => runSweep("/api/admin/archives/run", "Archival sweep")}>
          {busy === "Archival sweep" ? "Running…" : "Run archival sweep"}
        </button>
        <button style={btn} disabled={!!busy}
          onClick={() => runSweep("/api/admin/archives/destroy-run", "Retention/destruction")}>
          {busy === "Retention/destruction" ? "Running…" : "Run retention/destruction"}
        </button>
        <button style={btn} disabled={!!busy} onClick={refresh}>Refresh</button>
      </div>

      {msg && <pre style={{ fontSize: 11, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8, overflowX: "auto" }}>{msg}</pre>}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
            <th style={{ padding: "6px 8px" }}>Matter</th>
            <th style={{ padding: "6px 8px" }}>Client</th>
            <th style={{ padding: "6px 8px" }}>Status</th>
            <th style={{ padding: "6px 8px" }}>Docs/Att</th>
            <th style={{ padding: "6px 8px" }}>Size</th>
            <th style={{ padding: "6px 8px" }}>Archived</th>
            <th style={{ padding: "6px 8px" }}>Retain until</th>
            <th style={{ padding: "6px 8px" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ padding: 16, color: "#94a3b8" }}>No archived matters yet.</td></tr>
          )}
          {rows.map((r) => {
            const s = status(r);
            return (
              <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px" }}>
                  {r.matter_title ?? <span style={{ color: "#94a3b8" }}>(untitled)</span>}
                  <div style={{ color: "#94a3b8", fontSize: 11 }}>{r.matter_type ?? "—"}{r.category ? ` · ${r.category}` : ""}</div>
                </td>
                <td style={{ padding: "6px 8px" }}>{r.user_email ?? "—"}</td>
                <td style={{ padding: "6px 8px", color: s.color, fontWeight: 600 }}>{s.label}</td>
                <td style={{ padding: "6px 8px" }}>{r.document_count}/{r.attachment_count}</td>
                <td style={{ padding: "6px 8px" }}>{fmtSize(r.size_bytes)}</td>
                <td style={{ padding: "6px 8px" }}>{fmtDate(r.archived_at)}</td>
                <td style={{ padding: "6px 8px" }}>{r.retention_until ? fmtDate(r.retention_until) : "indefinite"}</td>
                <td style={{ padding: "6px 8px" }}>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {!r.destroyed_at && <button style={btn} disabled={busy === r.id} onClick={() => download(r.id)}>Download</button>}
                    {!r.destroyed_at && (
                      <button style={btn} disabled={busy === r.id} onClick={() => toggleHold(r)}>
                        {r.legal_hold ? "Release hold" : "Hold"}
                      </button>
                    )}
                    {!r.destroyed_at && (
                      <button style={{ ...btn, color: "#991b1b", borderColor: "#fecaca" }} disabled={busy === r.id || r.legal_hold} onClick={() => destroy(r)}>
                        Destroy
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
