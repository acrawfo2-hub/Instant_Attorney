"use client";

import { useMemo, useState } from "react";
import {
  summarizeFinancialPicture,
  swornFilingReadiness,
  labelFor,
} from "@/lib/financial-picture";
import type { FinancialItem, VerificationStatus } from "@/lib/types";

const gold = "var(--brand-gold)";
const navy = "var(--brand-navy)";
const textDk = "var(--brand-text-dk)";
const textMd = "var(--brand-text-md)";
const textLt = "var(--brand-text-lt)";
const border = "var(--brand-border)";
const white = "var(--brand-white)";

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmt = (lo: number | null, hi: number | null) => {
  const l = lo ?? 0, h = hi ?? 0;
  return l === 0 && h === 0 ? "—" : l === h ? usd(l) : `${usd(l)}–${usd(h)}`;
};

const VERIF: Record<VerificationStatus, { label: string; bg: string; color: string }> = {
  unverified: { label: "Client estimate", bg: "rgba(120,120,120,0.12)", color: "#666" },
  doc_supported: { label: "Document-backed", bg: "rgba(70,110,160,0.14)", color: "#3a5e86" },
  attorney_verified: { label: "Verified", bg: "rgba(45,122,79,0.14)", color: "#2d7a4f" },
};

export default function AttorneyFinancialReview({
  initialItems,
}: {
  initialItems: FinancialItem[];
}) {
  const [items, setItems] = useState<FinancialItem[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  const summary = useMemo(() => summarizeFinancialPicture(items), [items]);
  const readiness = useMemo(() => swornFilingReadiness(items), [items]);

  async function act(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/attorney/financials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.item) setItems((prev) => prev.map((p) => (p.id === id ? (data.item as FinancialItem) : p)));
    } finally {
      setBusyId(null);
    }
  }

  const flagged = items.filter((i) => i.needs_attorney_review || (Array.isArray(i.red_flags) && i.red_flags.length > 0));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={card}>
        <h2 style={cardTitle}>Financial review</h2>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 8 }}>
          <Stat label="Net worth (est.)" value={fmt(summary.net.low, summary.net.high)} />
          <Stat label="Items" value={String(summary.counts.total)} />
          <Stat label="Verified" value={`${readiness.attorneyVerified}/${readiness.total}`} />
          <Stat label="Flagged" value={String(flagged.length)} />
        </div>
        <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: readiness.ready ? "rgba(45,122,79,0.12)" : "rgba(200,169,110,0.14)", color: readiness.ready ? "#15803d" : "#8a6d2f" }}>
          {readiness.ready
            ? "✓ All items verified and no open flags — clear to finalize a sworn filing."
            : `Not yet clear to swear: ${readiness.pending.length} item(s) need verification${readiness.openFlagCount > 0 ? `, ${readiness.openFlagCount} flagged` : ""}.`}
        </div>
      </div>

      {flagged.length > 0 && (
        <div style={{ ...card, borderColor: "#fecaca" }}>
          <h2 style={{ ...cardTitle, color: "#991b1b" }}>Flagged — needs your eyes</h2>
          <p style={{ fontSize: 12.5, color: textMd, margin: "2px 0 0" }}>
            The client wasn&apos;t blocked — these were surfaced for you. Review, then resolve the flag or verify the item.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {items.map((it) => {
          const vb = VERIF[it.verification_status];
          const hasFlags = Array.isArray(it.red_flags) && it.red_flags.length > 0;
          return (
            <div key={it.id} style={{ ...card, padding: "12px 14px", borderColor: hasFlags ? "#fecaca" : border }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: textDk }}>{it.label}</span>
                    <Tag>{labelFor.category(it.category)}</Tag>
                    {it.owner !== "client" && <Tag>{labelFor.owner(it.owner)}</Tag>}
                    {it.characterization !== "mixed_or_unknown" && it.characterization !== "not_applicable" && <Tag>{labelFor.characterization(it.characterization)}</Tag>}
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: vb.color, background: vb.bg, padding: "1px 7px", borderRadius: 999 }}>{vb.label}</span>
                  </div>
                  {it.acquisition_note && <div style={{ fontSize: 12, color: textLt, marginTop: 3 }}>{it.acquisition_note}</div>}
                  {hasFlags && (
                    <div style={{ marginTop: 5, display: "grid", gap: 3 }}>
                      {it.red_flags.map((f, i) => (
                        <div key={i} style={{ fontSize: 11.5, color: "#991b1b" }}>
                          ⚑ <strong style={{ textTransform: "uppercase", fontSize: 10 }}>{f.severity}</strong> — {f.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, fontSize: 14, fontWeight: 600, color: navy }}>{fmt(it.value_low, it.value_high)}</div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                <button disabled={busyId === it.id || it.verification_status === "attorney_verified"} onClick={() => act(it.id, { verification_status: "attorney_verified" })} style={btnSm(it.verification_status === "attorney_verified")}>Mark verified</button>
                <button disabled={busyId === it.id} onClick={() => act(it.id, { verification_status: "doc_supported" })} style={btnGhostSm}>Doc-backed</button>
                <button disabled={busyId === it.id} onClick={() => act(it.id, { verification_status: "unverified" })} style={btnGhostSm}>Unverify</button>
                {(hasFlags || it.needs_attorney_review) && (
                  <button disabled={busyId === it.id} onClick={() => act(it.id, { resolve_flags: true })} style={{ ...btnGhostSm, color: "#991b1b", borderColor: "#fecaca" }}>Resolve flag</button>
                )}
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p style={{ fontSize: 13, color: textLt, textAlign: "center", padding: "20px 0" }}>No financial items yet.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: textLt, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: navy, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 10.5, color: textMd, background: "rgba(26,22,18,0.05)", padding: "1px 7px", borderRadius: 999 }}>{children}</span>;
}

const card: React.CSSProperties = { background: white, border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px" };
const cardTitle: React.CSSProperties = { fontFamily: "var(--font-playfair), Georgia, serif", fontSize: 17, color: textDk, margin: 0 };
const btnGhostSm: React.CSSProperties = { background: "transparent", color: textMd, border: `1px solid ${border}`, borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
function btnSm(done: boolean): React.CSSProperties {
  return { background: done ? "rgba(45,122,79,0.14)" : gold, color: done ? "#2d7a4f" : "#1a1008", border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: done ? "default" : "pointer" };
}
