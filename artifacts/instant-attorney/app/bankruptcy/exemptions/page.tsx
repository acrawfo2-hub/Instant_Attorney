"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ASSET_CATEGORIES, type AssetCategory } from "@/lib/bankruptcy-exemptions";

// ─────────────────────────────────────────────────────────────────────────────
// Texas exemptions — "what would I keep?" A free tool. Calls
// /api/bankruptcy/exemptions (pure compute, no AI, no token spend). When opened
// from a file (?caseFileId=), the result is saved as a confirmed fact. It never
// changes which instruments are recommended.
// ─────────────────────────────────────────────────────────────────────────────

const navy = "var(--brand-navy)";
const gold = "var(--brand-gold)";
const cream = "var(--brand-cream)";
const textDk = "var(--brand-text-dk)";
const textMd = "var(--brand-text-md)";
const textLt = "var(--brand-text-lt)";
const border = "var(--brand-border)";
const serif = "var(--font-playfair), Georgia, serif";

function Shield({ size = 18, color = gold }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

interface Row {
  category: AssetCategory;
  value: string;
}
interface AssetResult {
  category: string;
  label: string;
  value: number;
  status: "exempt" | "capped" | "at_risk";
  note: string;
}
interface Result {
  isSingle: boolean;
  cap: number;
  assets: AssetResult[];
  totalValue: number;
  totalAtRisk: number;
  keepsEverything: boolean;
  summary: string;
  assumptions: string[];
  disclaimer: string;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const STATUS_STYLE: Record<AssetResult["status"], { color: string; label: string }> = {
  exempt: { color: "#2d7a4f", label: "Protected" },
  capped: { color: "#8a6d2f", label: "Protected (within cap)" },
  at_risk: { color: "#b4341f", label: "May be at risk" },
};

function Exemptions() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [isSingle, setIsSingle] = useState(false);
  const [rows, setRows] = useState<Row[]>([
    { category: "homestead", value: "" },
    { category: "vehicle", value: "" },
    { category: "household_goods", value: "" },
    { category: "cash_bank", value: "" },
  ]);
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  const addRow = () => setRows((prev) => [...prev, { category: "other_nonexempt", value: "" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const hasValue = rows.some((r) => Number(r.value) > 0);

  async function run() {
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      const assets = rows.filter((r) => Number(r.value) > 0).map((r) => ({ category: r.category, value: Number(r.value) }));
      const res = await fetch("/api/bankruptcy/exemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets, isSingle, caseFileId: caseFileId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok && !data.result) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult(data.result as Result);
      setSaved(Boolean(data.saved));
      if (data.error) setError(data.error);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const field = {
    boxSizing: "border-box" as const,
    padding: "9px 10px",
    fontSize: 14,
    border: `1px solid ${border}`,
    borderRadius: 7,
    fontFamily: "inherit",
    color: textDk,
    background: "var(--brand-white)",
  };

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>What You&apos;d Keep</span>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · Texas exemptions are among the most generous in the U.S.
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          What would I keep?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 22px" }}>
          The biggest fear about bankruptcy is losing your things — but in Texas, most people keep everything.
          List what you own and we&apos;ll show what&apos;s protected.
        </p>

        <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: textMd }}>
              <input type="radio" checked={!isSingle} onChange={() => setIsSingle(false)} /> Family ({usd(100000)} cap)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: textMd }}>
              <input type="radio" checked={isSingle} onChange={() => setIsSingle(true)} /> Single adult ({usd(50000)} cap)
            </label>
          </div>

          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <select value={r.category} onChange={(e) => updateRow(i, { category: e.target.value as AssetCategory })} style={{ ...field, width: "100%" }}>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.category} value={c.category}>{c.label}</option>
                ))}
              </select>
              <input type="number" inputMode="decimal" value={r.value} onChange={(e) => updateRow(i, { value: e.target.value })} placeholder="value" style={{ ...field, width: "100%" }} />
              <button onClick={() => removeRow(i)} aria-label="Remove" style={{ border: "none", background: "transparent", color: textLt, cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
            </div>
          ))}

          <button onClick={addRow} style={{ marginTop: 4, padding: "8px 14px", fontSize: 13.5, fontWeight: 500, color: navy, background: "transparent", border: `1px dashed ${border}`, borderRadius: 7, cursor: "pointer" }}>
            + Add asset
          </button>

          {error && <p style={{ color: "#b4341f", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}

          <button
            onClick={run}
            disabled={!hasValue || loading}
            style={{ marginTop: 14, padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: hasValue && !loading ? "pointer" : "default", opacity: hasValue && !loading ? 1 : 0.5 }}
          >
            {loading ? "Checking…" : "See what's protected →"}
          </button>
        </div>

        {result && (
          <section style={{ marginTop: 28 }}>
            <div style={{ background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: 24 }}>
              <p style={{ fontSize: 13, letterSpacing: 0.5, color: gold, margin: "0 0 8px" }}>
                {result.keepsEverything ? "GOOD NEWS" : "MOSTLY PROTECTED"}
              </p>
              <p style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.25, margin: "0 0 12px" }}>{result.summary}</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {result.assets.map((a, i) => {
                  const st = STATUS_STYLE[a.status];
                  return (
                    <li key={i} style={{ padding: "9px 0", borderBottom: i < result.assets.length - 1 ? "1px solid rgba(255,255,255,0.12)" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.92)" }}>{a.label} · {usd(a.value)}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: st.color === "#b4341f" ? "#ffb4a6" : st.color === "#2d7a4f" ? "#9ad8b4" : gold }}>{st.label}</span>
                      </div>
                      <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", margin: "3px 0 0", lineHeight: 1.45 }}>{a.note}</p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div style={{ marginTop: 16, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
              {result.assumptions.length > 0 && (
                <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13, color: textMd, lineHeight: 1.55 }}>
                  {result.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              )}
              {caseFileId && (
                <p style={{ fontSize: 13, color: saved ? "var(--brand-navy)" : textLt, fontWeight: saved ? 600 : 400, margin: "0 0 10px" }}>
                  {saved ? "✓ Saved to your file." : "Not saved to your file."}
                </p>
              )}
              <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: 0 }}>{result.disclaimer}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function ExemptionsPage() {
  return (
    <Suspense fallback={null}>
      <Exemptions />
    </Suspense>
  );
}
