"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FINANCIAL_DISCLOSURE_STANDARD } from "@/lib/financial-picture";

/**
 * The upfront, click-through Financial Disclosure Standard. Shown before a client
 * can enter any finances, so they understand — as plainly and early as possible —
 * that full honest disclosure is required, that we can't help conceal or
 * misstate assets, and that estimates are verified before any sworn filing.
 */
export default function FinancialDisclosureModal({
  caseFileId,
  backHref,
  onAck,
}: {
  caseFileId: string;
  backHref: string;
  onAck: () => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const std = FINANCIAL_DISCLOSURE_STANDARD;

  async function acknowledge() {
    if (!checked) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/financials/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFileId, action: "ack_disclosure" }),
      });
      if (!res.ok) {
        setErr("Couldn't save your acknowledgment. Please try again.");
        return;
      }
      onAck();
    } catch {
      setErr("Couldn't save your acknowledgment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Financial disclosure standard">
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a6d2f" }}>
          Please read first
        </div>
        <h1 style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontSize: 24, color: "var(--brand-navy)", margin: "6px 0 8px" }}>
          {std.title}
        </h1>
        <p style={{ fontSize: 14, color: "var(--brand-text-md)", lineHeight: 1.55, margin: "0 0 16px" }}>{std.intro}</p>

        <div style={{ display: "grid", gap: 12 }}>
          {std.points.map((p, i) => (
            <div key={i} style={{ borderLeft: "3px solid var(--brand-gold)", paddingLeft: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--brand-text-dk)", marginBottom: 2 }}>{p.heading}</div>
              <div style={{ fontSize: 13, color: "var(--brand-text-md)", lineHeight: 1.55 }}>{p.body}</div>
            </div>
          ))}
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18, cursor: "pointer" }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 13, color: "var(--brand-text-dk)", lineHeight: 1.5 }}>{std.acknowledgment}</span>
        </label>

        {err && <p style={{ color: "#b91c1c", fontSize: 12.5, margin: "8px 0 0" }}>{err}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button onClick={acknowledge} disabled={!checked || busy} style={{ ...btn, opacity: !checked || busy ? 0.55 : 1, cursor: !checked || busy ? "not-allowed" : "pointer" }}>
            {busy ? "Saving…" : "I understand — continue"}
          </button>
          <button onClick={() => router.push(backHref)} style={btnGhost}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(12,25,41,0.55)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "24px 16px",
  overflowY: "auto",
  zIndex: 100,
};
const card: React.CSSProperties = {
  background: "var(--brand-white)",
  borderRadius: 14,
  padding: "24px 26px",
  maxWidth: 560,
  width: "100%",
  margin: "auto",
  boxShadow: "0 20px 60px rgba(12,25,41,0.3)",
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
};
const btn: React.CSSProperties = {
  background: "var(--brand-gold)",
  color: "#1a1008",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 13.5,
  fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--brand-text-md)",
  border: "1px solid var(--brand-border)",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};
