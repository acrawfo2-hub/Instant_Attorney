"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PiClaimType } from "@/lib/pi-sol-calc";

const navy = "var(--brand-navy)";
const gold = "var(--brand-gold)";
const cream = "var(--brand-cream)";
const textDk = "var(--brand-text-dk)";
const textMd = "var(--brand-text-md)";
const textLt = "var(--brand-text-lt)";
const border = "var(--brand-border)";
const serif = "var(--font-playfair), Georgia, serif";

const CLAIM_OPTIONS: { value: PiClaimType; label: string }[] = [
  { value: "auto_accident", label: "Auto / motor-vehicle accident" },
  { value: "premises", label: "Premises liability (slip-and-fall)" },
  { value: "general_pi", label: "Other personal injury" },
  { value: "wrongful_death", label: "Wrongful death" },
  { value: "medical_malpractice", label: "Medical malpractice" },
];

interface SolResult {
  claimLabel: string;
  incidentDate: string;
  filingDeadline: string;
  daysRemaining: number;
  expired: boolean;
  urgency: string;
  statuteCitation: string;
  reposeDeadline: string | null;
  reposeExpired: boolean;
  assumptions: string[];
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

function SolScreener() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [incidentDate, setIncidentDate] = useState("");
  const [claimType, setClaimType] = useState<PiClaimType>("auto_accident");
  const [treatmentEndDate, setTreatmentEndDate] = useState("");
  const [result, setResult] = useState<SolResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = incidentDate.length >= 8;

  async function runScreener() {
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch("/api/personal-injury/sol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentDate,
          claimType,
          treatmentEndDate: claimType === "medical_malpractice" && treatmentEndDate ? treatmentEndDate : undefined,
          caseFileId: caseFileId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.result) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setResult(data.result as SolResult);
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

  const urgencyColor =
    result?.urgency === "expired" || result?.reposeExpired
      ? "#b4341f"
      : result?.urgency === "critical"
        ? "#b4341f"
        : result?.urgency === "warning"
          ? "#9a6b00"
          : navy;

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Limitations Screener</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free screener · Texas deadlines · no AI charge
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          How long do you have to sue?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 28px" }}>
          Texas generally gives you two years for injury claims — but malpractice timing is different. This
          screener computes a best-effort deadline from your dates. It is not legal advice.
        </p>

        <div style={{ display: "grid", gap: 18, marginBottom: 24 }}>
          <div>
            <label style={labelStyle}>Date of injury / incident</label>
            <input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Type of claim</label>
            <select value={claimType} onChange={(e) => setClaimType(e.target.value as PiClaimType)} style={fieldStyle}>
              {CLAIM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {claimType === "medical_malpractice" && (
            <div>
              <label style={labelStyle}>Treatment end date (if different)</label>
              <input type="date" value={treatmentEndDate} onChange={(e) => setTreatmentEndDate(e.target.value)} style={fieldStyle} />
            </div>
          )}
        </div>

        <button
          onClick={runScreener}
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
          {loading ? "Computing…" : "Check my deadline"}
        </button>

        {error && <p style={{ color: "#b4341f", fontSize: 14, marginTop: 14 }}>{error}</p>}

        {result && (
          <section style={{ marginTop: 28, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 13, color: textLt, marginBottom: 4 }}>{result.claimLabel}</div>
            <div style={{ fontFamily: serif, fontSize: 28, color: urgencyColor, marginBottom: 8 }}>
              {result.expired || result.reposeExpired
                ? "Deadline may have passed"
                : `${result.daysRemaining} days remaining`}
            </div>
            <p style={{ fontSize: 15, margin: "0 0 6px" }}>
              File by <strong>{result.filingDeadline}</strong>
            </p>
            <p style={{ fontSize: 13, color: textLt, margin: "0 0 16px" }}>{result.statuteCitation}</p>
            {result.reposeDeadline && (
              <p style={{ fontSize: 13, color: result.reposeExpired ? "#b4341f" : textMd, margin: "0 0 12px" }}>
                Malpractice repose deadline: {result.reposeDeadline}
                {result.reposeExpired ? " (passed)" : ""}
              </p>
            )}
            <p style={{ fontSize: 14, lineHeight: 1.6, color: textMd, margin: "0 0 12px" }}>{result.guidance}</p>
            {result.assumptions.length > 0 && (
              <ul style={{ fontSize: 12.5, color: textLt, margin: "0 0 12px", paddingLeft: 18 }}>
                {result.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            {saved && (
              <p style={{ fontSize: 13, color: navy, fontWeight: 500, margin: "0 0 8px" }}>
                Saved to your Living File.
              </p>
            )}
            <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: 0, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
              {result.disclaimer}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default function PersonalInjurySolPage() {
  return (
    <Suspense fallback={null}>
      <SolScreener />
    </Suspense>
  );
}
