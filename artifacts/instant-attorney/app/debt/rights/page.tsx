"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  DEBT_SITUATIONS,
  debtRightsFor,
  isKnownDebtSituation,
  type DebtSituation,
} from "@/lib/debt-collection-rights";
import { getDebtInstrument } from "@/lib/debt-instruments";

// ─────────────────────────────────────────────────────────────────────────────
// Know Your Debt-Collection Rights — a free, informational tool. Pure client
// render over lib/debt-collection-rights.ts (no AI, no API). Pick your situation
// and see your rights, concrete action items, the traps to avoid, and the
// letters that assert each right. It changes nothing in your file.
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

function RightsTool() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");
  const initial = params.get("situation");
  const [situation, setSituation] = useState<DebtSituation | null>(
    initial && isKnownDebtSituation(initial) ? initial : null
  );

  const guidance = situation ? debtRightsFor(situation) : null;
  const wizardHref = (wizardType: string) =>
    caseFileId ? `/wizard/${wizardType}?caseFileId=${caseFileId}` : `/free-chat?area=debt`;

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Debt-Collection Rights</span>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · your rights and next steps · changes nothing in your file
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          Know your rights
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 22px" }}>
          Debt problems are common and solvable, and you have real protections — especially in Texas. Pick
          what&apos;s happening and we&apos;ll lay out your rights, the steps you can take, and the traps to avoid.
        </p>

        {/* Situation picker */}
        <div style={{ display: "grid", gap: 10, marginBottom: 8 }}>
          {DEBT_SITUATIONS.map((s) => {
            const active = s.situation === situation;
            return (
              <button
                key={s.situation}
                onClick={() => setSituation(s.situation)}
                style={{
                  textAlign: "left",
                  padding: "13px 15px",
                  borderRadius: 10,
                  border: `1px solid ${active ? gold : border}`,
                  background: active ? "rgba(200,169,110,0.12)" : "var(--brand-white)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 14.5, fontWeight: 600, color: navy }}>{s.label}</div>
                <div style={{ fontSize: 13, color: textLt, marginTop: 2 }}>{s.blurb}</div>
              </button>
            );
          })}
        </div>

        {guidance && (
          <section style={{ marginTop: 24, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 22 }}>
            <h2 style={{ fontFamily: serif, fontSize: 22, margin: "0 0 14px", color: navy }}>{guidance.label}</h2>

            <h3 style={sectionLabel}>Your rights</h3>
            <ul style={listStyle}>
              {guidance.rights.map((r, i) => (
                <li key={i} style={{ marginBottom: 6 }}>{r}</li>
              ))}
            </ul>

            <h3 style={sectionLabel}>What you can do</h3>
            <ol style={{ ...listStyle, paddingLeft: 18 }}>
              {guidance.actions.map((a, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  {a.urgent && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#b4341f", background: "rgba(180,52,31,0.1)", padding: "2px 6px", borderRadius: 4, marginRight: 6 }}>
                      Time-critical
                    </span>
                  )}
                  <span style={{ fontWeight: 500 }}>{a.step}</span>
                  {a.why && <span style={{ color: textLt }}> — {a.why}</span>}
                </li>
              ))}
            </ol>

            <h3 style={{ ...sectionLabel, color: "#b4341f" }}>Be careful not to</h3>
            <ul style={listStyle}>
              {guidance.cautions.map((c, i) => (
                <li key={i} style={{ marginBottom: 6 }}>{c}</li>
              ))}
            </ul>

            {guidance.relevant_instruments.length > 0 && (
              <>
                <h3 style={sectionLabel}>Letters that assert these rights</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {guidance.relevant_instruments.map((key) => {
                    const inst = getDebtInstrument(key);
                    if (!inst) return null;
                    return (
                      <Link
                        key={key}
                        href={wizardHref(inst.wizard_type)}
                        style={{ fontSize: 13.5, fontWeight: 500, color: navy, background: gold, padding: "9px 14px", borderRadius: 8, textDecoration: "none" }}
                      >
                        {inst.label} →
                      </Link>
                    );
                  })}
                </div>
                {!caseFileId && (
                  <p style={{ fontSize: 12.5, color: textLt, margin: "10px 0 0" }}>
                    Open this from one of your files to draft these letters with your details filled in.
                  </p>
                )}
              </>
            )}

            <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "18px 0 0", borderTop: `1px solid ${border}`, paddingTop: 12 }}>
              {guidance.disclaimer}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

const sectionLabel = {
  fontSize: 12.5,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  color: "var(--brand-text-md)",
  margin: "18px 0 8px",
};
const listStyle = {
  margin: 0,
  paddingLeft: 20,
  fontSize: 14,
  lineHeight: 1.55,
  color: "var(--brand-text-md)",
};

export default function DebtRightsPage() {
  return (
    <Suspense fallback={null}>
      <RightsTool />
    </Suspense>
  );
}
