"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Chapter 7 full means test (§ 707(b)(2) disposable-income step) — a free tool for
// above-median filers. Calls /api/bankruptcy/disposable-income (pure compute, no
// AI, no token spend). When opened from a file (?caseFileId=), the result is
// saved as a confirmed fact. Allowed-expense amounts come from IRS standards and
// Form 122A-2, so they're entered by the user; this runs the determination.
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
  monthlyCMI: number;
  totalDeductions: number;
  monthlyDisposableIncome: number;
  sixtyMonthDisposableIncome: number;
  lowerThreshold: number;
  upperThreshold: number;
  thresholdsAsOf: string;
  presumption: string;
  passesChapter7: boolean | null;
  guidance: string;
  assumptions: string[];
  disclaimer: string;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const COMPONENTS: { key: string; label: string }[] = [
  { key: "livingStandards", label: "Food, clothing, personal care (IRS National Standards)" },
  { key: "housingUtilities", label: "Housing & utilities (IRS Local Standards)" },
  { key: "transportation", label: "Transportation (IRS Local Standards)" },
  { key: "taxesAndPayroll", label: "Taxes & mandatory payroll deductions" },
  { key: "healthAndInsurance", label: "Health care & insurance" },
  { key: "securedDebtMonthly", label: "Secured debt (mortgage/car, avg)" },
  { key: "priorityDebtMonthly", label: "Priority debt (support/taxes ÷ 60)" },
  { key: "otherNecessary", label: "Other necessary (childcare, court-ordered)" },
];

function FullMeansTest() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [monthlyCMI, setMonthlyCMI] = useState("");
  const [unsecuredDebt, setUnsecuredDebt] = useState("");
  const [comp, setComp] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalExpenses = COMPONENTS.reduce((sum, c) => sum + (Number(comp[c.key]) || 0), 0);
  const canSubmit = Number(monthlyCMI) > 0 && totalExpenses > 0;

  async function run() {
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      const expenseComponents: Record<string, number> = {};
      for (const c of COMPONENTS) if (Number(comp[c.key]) > 0) expenseComponents[c.key] = Number(comp[c.key]);
      const res = await fetch("/api/bankruptcy/disposable-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyCMI: Number(monthlyCMI),
          expenseComponents,
          nonPriorityUnsecuredDebt: unsecuredDebt ? Number(unsecuredDebt) : undefined,
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
    padding: "9px 10px",
    fontSize: 14,
    border: `1px solid ${border}`,
    borderRadius: 7,
    fontFamily: "inherit",
    color: textDk,
    background: "var(--brand-white)",
  };
  const labelStyle = { display: "block", fontSize: 13, fontWeight: 500, color: textMd, marginBottom: 6 };

  const verdictColor = result?.passesChapter7 === true ? "#9ad8b4" : result?.passesChapter7 === false ? "#ffb4a6" : gold;

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Full Means Test</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · the full test for above-median filers
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 32, lineHeight: 1.15, margin: "0 0 14px" }}>
          The full means test
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, color: textMd, margin: "0 0 8px" }}>
          If you&apos;re above the median, this step deducts your allowed living expenses. Many above-median
          filers still pass. Enter your monthly income and the allowed expense amounts.
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: textLt, margin: "0 0 22px" }}>
          Allowed amounts come from the{" "}
          <a href="https://www.irs.gov/businesses/small-businesses-self-employed/collection-financial-standards" target="_blank" rel="noreferrer" style={{ color: navy }}>
            IRS Collection Financial Standards
          </a>{" "}
          and Form 122A-2 — this is an estimate from the figures you enter.
        </p>

        <div style={{ display: "grid", gap: 14, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
          <div>
            <label style={labelStyle}>Current monthly income</label>
            <input type="number" inputMode="decimal" value={monthlyCMI} onChange={(e) => setMonthlyCMI(e.target.value)} placeholder="e.g. 7000" style={{ ...field, width: "100%" }} />
          </div>

          <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Allowed monthly expenses</div>
            <div style={{ display: "grid", gap: 8 }}>
              {COMPONENTS.map((c) => (
                <div key={c.key} style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: textMd }}>{c.label}</span>
                  <input type="number" inputMode="decimal" value={comp[c.key] ?? ""} onChange={(e) => setComp((p) => ({ ...p, [c.key]: e.target.value }))} placeholder="0" style={field} />
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12.5, color: textLt, margin: "10px 0 0", textAlign: "right" }}>
              Total deductions: <strong>{usd(totalExpenses)}</strong>/mo
            </p>
          </div>

          <div style={{ borderTop: `1px solid ${border}`, paddingTop: 12 }}>
            <label style={labelStyle}>Total nonpriority unsecured debt (optional — resolves the middle band)</label>
            <input type="number" inputMode="decimal" value={unsecuredDebt} onChange={(e) => setUnsecuredDebt(e.target.value)} placeholder="credit cards, medical, etc." style={{ ...field, width: "100%" }} />
          </div>

          {error && <p style={{ color: "#b4341f", fontSize: 14, margin: 0 }}>{error}</p>}

          <button
            onClick={run}
            disabled={!canSubmit || loading}
            style={{ padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: canSubmit && !loading ? "pointer" : "default", opacity: canSubmit && !loading ? 1 : 0.5 }}
          >
            {loading ? "Calculating…" : "Run the full test →"}
          </button>
        </div>

        {result && (
          <section style={{ marginTop: 28, background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: 24 }}>
            <p style={{ fontSize: 13, letterSpacing: 0.5, color: gold, margin: "0 0 6px" }}>FULL MEANS TEST</p>
            <p style={{ fontFamily: serif, fontSize: 24, lineHeight: 1.2, margin: "0 0 12px", color: verdictColor }}>
              {result.passesChapter7 === true ? "Passes — Chapter 7 available" : result.passesChapter7 === false ? "Presumption of abuse — Chapter 13 likely" : "Middle band — add your unsecured debt"}
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", margin: "0 0 12px" }}>
              Monthly disposable income {usd(result.monthlyDisposableIncome)} × 60 = {usd(result.sixtyMonthDisposableIncome)}
              <span style={{ color: "rgba(255,255,255,0.6)" }}> (thresholds {usd(result.lowerThreshold)} / {usd(result.upperThreshold)}, eff. {result.thresholdsAsOf})</span>
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.55, margin: "0 0 14px" }}>{result.guidance}</p>

            {result.assumptions.length > 0 && (
              <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
                {result.assumptions.map((a, i) => <li key={i}>{a}</li>)}
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

export default function FullMeansTestPage() {
  return (
    <Suspense fallback={null}>
      <FullMeansTest />
    </Suspense>
  );
}
