"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Chapter 7 means test (median-income screen) — a free tool. Calls
// /api/bankruptcy/means-test (pure compute, no AI, no token spend). When opened
// from a file (?caseFileId=), the result is saved as a confirmed fact so
// bankruptcy guidance/documents reflect it. It never changes which wizards run.
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

interface Result {
  householdSize: number;
  annualIncome: number;
  medianIncome: number;
  medianAsOf: string;
  belowMedian: boolean;
  marginAnnual: number;
  outcome: string;
  guidance: string;
  assumptions: string[];
  disclaimer: string;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function MeansTest() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [householdSize, setHouseholdSize] = useState("1");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [medianOverride, setMedianOverride] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Number(monthlyIncome) > 0 && Number(householdSize) >= 1;

  async function run() {
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch("/api/bankruptcy/means-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdSize: Number(householdSize),
          averageMonthlyIncome: Number(monthlyIncome),
          medianOverride: medianOverride ? Number(medianOverride) : undefined,
          caseFileId: caseFileId ?? undefined,
        }),
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
    padding: 12,
    fontSize: 15,
    border: `1px solid ${border}`,
    borderRadius: 8,
    fontFamily: "inherit",
    color: textDk,
    background: "var(--brand-white)",
  };
  const labelStyle = { display: "block", fontSize: 13, fontWeight: 500, color: textMd, marginBottom: 6 };

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Chapter 7 Means Test</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · the income screen for Chapter 7 eligibility
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          Could I file Chapter 7?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 8px" }}>
          The first step of the means test compares your income to the Texas median for your household size.
          At or below the median, Chapter 7 is generally available — most people clear this screen.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: textLt, margin: "0 0 24px" }}>
          {caseFileId
            ? "We'll save the result to your file so your bankruptcy guidance reflects it."
            : "Open this from one of your files and we'll save the result so your documents can use it."}
        </p>

        <div style={{ display: "grid", gap: 16, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Household size</label>
              <select value={householdSize} onChange={(e) => setHouseholdSize(e.target.value)} style={{ ...field, width: "100%" }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n}{n === 8 ? "+" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Average monthly household income</label>
              <input type="number" inputMode="decimal" value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} placeholder="last 6 months avg" style={{ ...field, width: "100%" }} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Your state median (optional — overrides the Texas default)</label>
            <input type="number" inputMode="decimal" value={medianOverride} onChange={(e) => setMedianOverride(e.target.value)} placeholder="from the current U.S. Trustee table" style={{ ...field, width: "100%" }} />
            <p style={{ fontSize: 12, color: textLt, margin: "6px 0 0" }}>
              Median figures update about twice a year. Confirm yours at{" "}
              <a href="https://www.justice.gov/ust/means-testing" target="_blank" rel="noreferrer" style={{ color: navy }}>
                the U.S. Trustee means-testing page
              </a>.
            </p>
          </div>

          {error && <p style={{ color: "#b4341f", fontSize: 14, margin: 0 }}>{error}</p>}

          <button
            onClick={run}
            disabled={!canSubmit || loading}
            style={{ padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: canSubmit && !loading ? "pointer" : "default", opacity: canSubmit && !loading ? 1 : 0.5 }}
          >
            {loading ? "Checking…" : "Run the income screen →"}
          </button>
        </div>

        {result && (
          <section style={{ marginTop: 28, background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: 24 }}>
            <p style={{ fontSize: 13, letterSpacing: 0.5, color: gold, margin: "0 0 6px" }}>MEANS-TEST SCREEN</p>
            <p style={{ fontFamily: serif, fontSize: 26, lineHeight: 1.2, margin: "0 0 12px" }}>
              {result.belowMedian ? "Below the median — Chapter 7 generally available" : "Above the median — full means test needed"}
            </p>
            <p style={{ fontSize: 14.5, color: "rgba(255,255,255,0.85)", margin: "0 0 14px" }}>
              Income {usd(result.annualIncome)}/yr vs Texas median {usd(result.medianIncome)} for a household of {result.householdSize}
              {result.marginAnnual >= 0 ? ` — ${usd(result.marginAnnual)} under.` : ` — ${usd(Math.abs(result.marginAnnual))} over.`}
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.55, margin: "0 0 14px" }}>{result.guidance}</p>

            {!result.belowMedian && (
              <a
                href={caseFileId ? `/bankruptcy/full-means-test?caseFileId=${caseFileId}` : "/bankruptcy/full-means-test"}
                style={{ display: "inline-block", marginBottom: 14, fontSize: 13.5, fontWeight: 500, color: navy, background: gold, padding: "9px 14px", borderRadius: 8, textDecoration: "none" }}
              >
                Run the full means test (with expense deductions) →
              </a>
            )}

            {result.assumptions.length > 0 && (
              <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>
                {result.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}

            {caseFileId && (
              <p style={{ fontSize: 13, color: saved ? gold : "rgba(255,255,255,0.7)", margin: "0 0 12px" }}>
                {saved ? "✓ Saved to your file." : "Not saved to your file."}
              </p>
            )}

            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.55, margin: 0 }}>{result.disclaimer}</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default function MeansTestPage() {
  return (
    <Suspense fallback={null}>
      <MeansTest />
    </Suspense>
  );
}
