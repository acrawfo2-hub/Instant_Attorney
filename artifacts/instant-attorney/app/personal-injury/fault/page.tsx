"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const navy = "var(--brand-navy)";
const gold = "var(--brand-gold)";
const cream = "var(--brand-cream)";
const textDk = "var(--brand-text-dk)";
const textMd = "var(--brand-text-md)";
const textLt = "var(--brand-text-lt)";
const border = "var(--brand-border)";
const serif = "var(--font-playfair), Georgia, serif";

interface FaultResult {
  totalDamages: number;
  claimantFaultPct: number;
  barred: boolean;
  netRecovery: number;
  reductionAmount: number;
  guidance: string;
  disclaimer: string;
}

function Shield({ size = 18, color = gold }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function FaultCalculator() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [damages, setDamages] = useState("");
  const [faultPct, setFaultPct] = useState("0");
  const [result, setResult] = useState<FaultResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const damagesNum = Number(damages.replace(/,/g, ""));
  const faultNum = Number(faultPct);
  const canSubmit = Number.isFinite(damagesNum) && damagesNum >= 0 && Number.isFinite(faultNum) && faultNum >= 0 && faultNum <= 100;

  async function calculate() {
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch("/api/personal-injury/fault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalDamages: damagesNum,
          claimantFaultPct: faultNum,
          caseFileId: caseFileId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.result) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setResult(data.result as FaultResult);
      setSaved(Boolean(data.saved));
      if (data.error) setError(data.error);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const fieldStyle = {
    width: "100%",
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
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Fault Impact</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>
        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          How fault affects your recovery
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 28px" }}>
          Texas uses modified comparative negligence: if you&apos;re more than 50% at fault, you recover nothing.
          Otherwise, your damages are reduced by your share of fault (§ 33.001).
        </p>

        <div style={{ display: "grid", gap: 18, marginBottom: 24 }}>
          <div>
            <label style={labelStyle}>Total damages ($)</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 75000"
              value={damages}
              onChange={(e) => setDamages(e.target.value)}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Your fault % (0–100)</label>
            <input
              type="range"
              min={0}
              max={100}
              value={faultPct}
              onChange={(e) => setFaultPct(e.target.value)}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 14, color: textMd, marginTop: 6 }}>{faultPct}%</div>
          </div>
        </div>

        <button
          onClick={calculate}
          disabled={!canSubmit || loading}
          style={{
            width: "100%",
            padding: "14px 20px",
            fontSize: 15,
            fontWeight: 600,
            color: navy,
            background: canSubmit && !loading ? gold : "rgba(200,169,110,0.4)",
            border: "none",
            borderRadius: 8,
            cursor: canSubmit && !loading ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Computing…" : "Calculate impact"}
        </button>

        {error && <p style={{ color: "#b4341f", fontSize: 14, marginTop: 14 }}>{error}</p>}

        {result && (
          <section style={{ marginTop: 28, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 22 }}>
            {result.barred ? (
              <>
                <div style={{ fontFamily: serif, fontSize: 24, color: "#b4341f", marginBottom: 8 }}>No recovery</div>
                <p style={{ fontSize: 15, color: textMd, margin: "0 0 12px" }}>
                  At {result.claimantFaultPct}% fault (over 50%), Texas law bars recovery under § 33.001.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontFamily: serif, fontSize: 28, color: navy, marginBottom: 4 }}>
                  {usd(result.netRecovery)}
                </div>
                <p style={{ fontSize: 14, color: textLt, margin: "0 0 12px" }}>
                  Estimated net recovery from {usd(result.totalDamages)} at {result.claimantFaultPct}% fault
                  (reduction: {usd(result.reductionAmount)})
                </p>
              </>
            )}
            <p style={{ fontSize: 14, lineHeight: 1.6, color: textMd, margin: "0 0 12px" }}>{result.guidance}</p>
            {saved && <p style={{ fontSize: 13, color: navy, fontWeight: 500 }}>Saved to your Living File.</p>}
            <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "12px 0 0", borderTop: `1px solid ${border}`, paddingTop: 12 }}>
              {result.disclaimer}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default function PersonalInjuryFaultPage() {
  return (
    <Suspense fallback={null}>
      <FaultCalculator />
    </Suspense>
  );
}
