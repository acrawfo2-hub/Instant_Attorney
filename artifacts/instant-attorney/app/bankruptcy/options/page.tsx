"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { recommendDebtOptions, debtOptionsDisclaimer, type OptionSignals, type Fit } from "@/lib/bankruptcy-options";

// ─────────────────────────────────────────────────────────────────────────────
// Debt-relief options — a free, informational tool. Pure client render over
// lib/bankruptcy-options.ts (no AI, no API). Answer a few quick questions and the
// realistic paths re-rank, each with when it fits and what to watch for. Changes
// nothing in your file.
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

const FIT_STYLE: Record<Fit, { bg: string; color: string; label: string }> = {
  strong: { bg: "rgba(45,122,79,0.14)", color: "#2d7a4f", label: "Strong fit" },
  possible: { bg: "rgba(200,169,110,0.18)", color: "#8a6d2f", label: "Possible" },
  unlikely: { bg: "rgba(120,120,120,0.14)", color: "#666", label: "Unlikely" },
};

type Tri = "unknown" | "yes" | "no";
const triToBool = (t: Tri): boolean | undefined => (t === "yes" ? true : t === "no" ? false : undefined);

function OptionsTool() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [belowMedian, setBelowMedian] = useState<Tri>("unknown");
  const [regularIncome, setRegularIncome] = useState<Tri>("unknown");
  const [behind, setBehind] = useState<Tri>("unknown");
  const [exempt, setExempt] = useState<Tri>("unknown");
  const [priorCh7, setPriorCh7] = useState<Tri>("unknown");
  const [lumpSum, setLumpSum] = useState<Tri>("unknown");

  const signals: OptionSignals = {
    belowMedian: triToBool(belowMedian),
    regularIncome: triToBool(regularIncome),
    behindOnSecuredWantKeep: triToBool(behind),
    assetsMostlyExempt: triToBool(exempt),
    priorCh7Within8yr: triToBool(priorCh7),
    hasLumpSumToSettle: triToBool(lumpSum),
  };
  const ranked = recommendDebtOptions(signals);

  const question = (label: string, value: Tri, set: (t: Tri) => void) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: `1px solid ${border}` }}>
      <span style={{ fontSize: 14, color: textMd }}>{label}</span>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {(["yes", "no", "unknown"] as Tri[]).map((t) => (
          <button
            key={t}
            onClick={() => set(t)}
            style={{
              fontSize: 12.5,
              padding: "5px 11px",
              borderRadius: 7,
              border: `1px solid ${value === t ? gold : border}`,
              background: value === t ? "rgba(200,169,110,0.16)" : "var(--brand-white)",
              color: navy,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {t === "unknown" ? "Not sure" : t}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Debt-Relief Options</span>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · ways to think it through · changes nothing in your file
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          What are my options?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 22px" }}>
          Bankruptcy is one option among several. Answer what you can — leave the rest &ldquo;Not sure&rdquo; — and
          the realistic paths will re-rank, each with when it fits and what to watch for.
        </p>

        <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: "6px 18px 14px" }}>
          {question("Is your income at or below the Texas median? (run the means test if unsure)", belowMedian, setBelowMedian)}
          {question("Do you have steady, regular income?", regularIncome, setRegularIncome)}
          {question("Are you behind on a house or car you want to keep?", behind, setBehind)}
          {question("Is most of what you own protected by Texas exemptions?", exempt, setExempt)}
          {question("Did you get a Chapter 7 discharge in the last 8 years?", priorCh7, setPriorCh7)}
          {question("Do you have a lump sum you could use to settle?", lumpSum, setLumpSum)}
        </div>

        <div style={{ marginTop: 24, display: "grid", gap: 14 }}>
          {ranked.map((o) => {
            const fs = FIT_STYLE[o.fit];
            return (
              <div key={o.key} style={{ background: "var(--brand-white)", border: `1px solid ${o.fit === "strong" ? gold : border}`, borderRadius: 12, padding: 18, opacity: o.fit === "unlikely" ? 0.72 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: navy, fontFamily: serif }}>{o.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: fs.color, background: fs.bg, padding: "2px 8px", borderRadius: 999 }}>
                    {fs.label}
                  </span>
                </div>
                <p style={{ fontSize: 13.5, color: textMd, lineHeight: 1.55, margin: "0 0 8px" }}>{o.summary}</p>
                <p style={{ fontSize: 13, color: textLt, margin: "0 0 10px", fontStyle: "italic" }}>{o.reason}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <div style={miniLabel}>Best when</div>
                    <ul style={miniList}>{o.bestWhen.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                  <div>
                    <div style={{ ...miniLabel, color: "#b4341f" }}>Watch out</div>
                    <ul style={miniList}>{o.watchOut.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "18px 2px 0" }}>{debtOptionsDisclaimer()}</p>
      </main>
    </div>
  );
}

const miniLabel = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  color: "var(--brand-text-md)",
  marginBottom: 4,
};
const miniList = {
  margin: 0,
  paddingLeft: 16,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "var(--brand-text-md)",
};

export default function OptionsPage() {
  return (
    <Suspense fallback={null}>
      <OptionsTool />
    </Suspense>
  );
}
