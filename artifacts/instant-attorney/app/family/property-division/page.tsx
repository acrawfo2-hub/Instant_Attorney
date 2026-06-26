"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Texas community-property division estimator — a standalone, free tool.
//
// Calls /api/family/property-division (pure compute, no AI, no token spend).
// When opened from a file (?caseFileId=), the estimate is saved into the Living
// File as a confirmed fact, so a Final Decree's property section seeds from it.
// It never changes which wizards are recommended — same "add value, don't
// disturb the pipeline" rule the other tools follow.
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

type Kind = "asset" | "debt";
/** A single control encodes both characterization and owner:
 *  "shared" → community; "a"/"b" → separate property of that spouse. */
type Whose = "shared" | "a" | "b";

interface Row {
  label: string;
  value: string;
  kind: Kind;
  whose: Whose;
}

interface Estimate {
  communityAssets: number;
  communityDebts: number;
  netCommunityEstate: number;
  separateNetA: number;
  separateNetB: number;
  communityShareToA: number;
  communityAwardA: number;
  communityAwardB: number;
  totalToA: number;
  totalToB: number;
  assumptions: string[];
  disclaimer: string;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const emptyRow = (): Row => ({ label: "", value: "", kind: "asset", whose: "shared" });

function PropertyDivision() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [rows, setRows] = useState<Row[]>([
    { label: "Marital home equity", value: "", kind: "asset", whose: "shared" },
    { label: "Retirement / 401(k)", value: "", kind: "asset", whose: "shared" },
    { label: "Credit card / loans", value: "", kind: "debt", whose: "shared" },
  ]);
  const [shareA, setShareA] = useState(50);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const hasValue = rows.some((r) => Number(r.value) > 0);

  async function estimateNow() {
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      const items = rows
        .filter((r) => Number(r.value) > 0)
        .map((r) => ({
          label: r.label.trim() || "Item",
          value: Number(r.value),
          kind: r.kind,
          characterization: r.whose === "shared" ? "community" : "separate",
          ...(r.whose === "a" || r.whose === "b" ? { owner: r.whose } : {}),
        }));
      const res = await fetch("/api/family/property-division", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, communityShareToA: shareA / 100, caseFileId: caseFileId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok && !data.estimate) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setEstimate(data.estimate as Estimate);
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
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Property Division Estimator</span>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free estimate · no account charge · won&apos;t change your documents
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          How would the property divide?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 8px" }}>
          Texas divides the <em>community</em> estate &mdash; what you built during the marriage &mdash;
          &ldquo;just and right,&rdquo; while each spouse keeps their <em>separate</em> property (owned
          before marriage, or received by gift or inheritance). List what you have for a starting-point
          picture.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: textLt, margin: "0 0 24px" }}>
          {caseFileId
            ? "We'll save the estimate to your file so a final decree can use it later."
            : "Open this from one of your files and we'll save the estimate so your documents can use it."}
        </p>

        <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.9fr 1fr auto", gap: 8, fontSize: 11.5, fontWeight: 600, color: textLt, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, padding: "0 2px" }}>
            <span>Item</span><span>Amount</span><span>Type</span><span>Whose</span><span />
          </div>

          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 0.9fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input value={r.label} onChange={(e) => updateRow(i, { label: e.target.value })} placeholder="e.g. Home equity" style={{ ...field, width: "100%" }} />
              <input type="number" inputMode="decimal" value={r.value} onChange={(e) => updateRow(i, { value: e.target.value })} placeholder="0" style={{ ...field, width: "100%" }} />
              <select value={r.kind} onChange={(e) => updateRow(i, { kind: e.target.value as Kind })} style={{ ...field, width: "100%" }}>
                <option value="asset">Asset</option>
                <option value="debt">Debt</option>
              </select>
              <select value={r.whose} onChange={(e) => updateRow(i, { whose: e.target.value as Whose })} style={{ ...field, width: "100%" }}>
                <option value="shared">Shared</option>
                <option value="a">Spouse A&apos;s</option>
                <option value="b">Spouse B&apos;s</option>
              </select>
              <button onClick={() => removeRow(i)} aria-label="Remove" style={{ border: "none", background: "transparent", color: textLt, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>
          ))}

          <button onClick={addRow} style={{ marginTop: 6, padding: "8px 14px", fontSize: 13.5, fontWeight: 500, color: navy, background: "transparent", border: `1px dashed ${border}`, borderRadius: 7, cursor: "pointer" }}>
            + Add item
          </button>

          <p style={{ fontSize: 12, color: textLt, margin: "10px 2px 0", lineHeight: 1.5 }}>
            Set the &ldquo;Whose&rdquo; column to a spouse only if they owned it before marriage or received
            it by gift or inheritance (separate property); otherwise leave it <strong>Shared</strong>.
          </p>

          {/* Division share */}
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${border}` }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: textMd, marginBottom: 8 }}>
              Division of the shared estate &mdash; {shareA}% to Spouse A / {100 - shareA}% to Spouse B
            </label>
            <input type="range" min={0} max={100} step={5} value={shareA} onChange={(e) => setShareA(Number(e.target.value))} style={{ width: "100%", accentColor: gold }} />
            <p style={{ fontSize: 12, color: textLt, margin: "4px 0 0" }}>
              The law&apos;s starting point is an equal (50/50) split; courts can divide unequally for cause.
            </p>
          </div>

          {error && <p style={{ color: "#b4341f", fontSize: 14, margin: "14px 0 0" }}>{error}</p>}

          <button
            onClick={estimateNow}
            disabled={!hasValue || loading}
            style={{ marginTop: 16, padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: hasValue && !loading ? "pointer" : "default", opacity: hasValue && !loading ? 1 : 0.5 }}
          >
            {loading ? "Estimating…" : "Estimate the division →"}
          </button>
        </div>

        {estimate && (
          <section style={{ marginTop: 28, background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: 24 }}>
            <p style={{ fontSize: 13, letterSpacing: 0.5, color: gold, margin: "0 0 12px" }}>ESTIMATED OUTCOME</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 2px" }}>Spouse A walks away with</p>
                <p style={{ fontFamily: serif, fontSize: 30, margin: 0 }}>{usd(estimate.totalToA)}</p>
              </div>
              <div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 2px" }}>Spouse B walks away with</p>
                <p style={{ fontFamily: serif, fontSize: 30, margin: 0 }}>{usd(estimate.totalToB)}</p>
              </div>
            </div>

            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.82)", margin: "0 0 16px", lineHeight: 1.55 }}>
              Net shared estate {usd(estimate.netCommunityEstate)} ({usd(estimate.communityAssets)} assets &minus;{" "}
              {usd(estimate.communityDebts)} debts), split {Math.round(estimate.communityShareToA * 100)}/
              {Math.round((1 - estimate.communityShareToA) * 100)}. Separate property kept: A {usd(estimate.separateNetA)}, B{" "}
              {usd(estimate.separateNetB)}.
            </p>

            {estimate.assumptions.length > 0 && (
              <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 13.5, color: "rgba(255,255,255,0.82)", lineHeight: 1.6 }}>
                {estimate.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}

            {caseFileId && (
              <p style={{ fontSize: 13, color: saved ? gold : "rgba(255,255,255,0.7)", margin: "0 0 12px" }}>
                {saved ? "✓ Saved to your file — your documents can use this." : "Not saved to your file."}
              </p>
            )}

            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.55, margin: 0 }}>{estimate.disclaimer}</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default function PropertyDivisionPage() {
  return (
    <Suspense fallback={null}>
      <PropertyDivision />
    </Suspense>
  );
}
