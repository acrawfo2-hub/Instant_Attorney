"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  assessNoncompete,
  type NoncompeteInput,
  type Enforceability,
  type FactorStatus,
} from "@/lib/noncompete-assessment";
import { getEmploymentInstrument } from "@/lib/employment-instruments";

// Pure client tool over lib/noncompete-assessment.ts (no AI, no API).

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

const VERDICT_STYLE: Record<Enforceability, { bg: string; color: string }> = {
  likely_enforceable: { bg: "rgba(180,52,31,0.08)", color: "#b4341f" },
  overbroad_reformable: { bg: "rgba(200,169,110,0.2)", color: "#8a6d2f" },
  likely_unenforceable: { bg: "rgba(45,122,79,0.14)", color: "#2d7a4f" },
  needs_more_info: { bg: "rgba(120,120,120,0.14)", color: "#555" },
};
const FACTOR_COLOR: Record<FactorStatus, string> = { ok: "#2d7a4f", concern: "#8a6d2f", missing: "#b4341f", unclear: "#999" };
const FACTOR_MARK: Record<FactorStatus, string> = { ok: "✓", concern: "!", missing: "✕", unclear: "?" };

function fieldStyle() {
  return { boxSizing: "border-box" as const, padding: "9px 10px", fontSize: 14, border: `1px solid ${border}`, borderRadius: 7, fontFamily: "inherit", color: textDk, background: "var(--brand-white)", width: "100%" };
}

function Noncompete() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");
  const [input, setInput] = useState<NoncompeteInput>({});
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<NoncompeteInput>) => setInput((p) => ({ ...p, ...patch }));
  const a = submitted ? assessNoncompete(input) : null;
  const wizardHref = (wizardType: string) => (caseFileId ? `/wizard/${wizardType}?caseFileId=${caseFileId}` : "/free-chat?area=employment");

  function row(label: string, control: React.ReactNode) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${border}` }}>
        <span style={{ fontSize: 14, color: textMd }}>{label}</span>{control}
      </div>
    );
  }
  const yesNo = (label: string, value: boolean | undefined, onChange: (v: boolean | undefined) => void) =>
    row(label,
      <select style={fieldStyle()} value={value === undefined ? "" : value ? "yes" : "no"} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "yes")}>
        <option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option>
      </select>
    );

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield /><span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Non-Compete Check</span>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · how much of a Texas non-compete actually holds up
        </div>
        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>Is my non-compete enforceable?</h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 8px" }}>
          In Texas the real question is rarely &ldquo;is it valid?&rdquo; — courts narrow overbroad non-competes
          rather than throw them out. So the question is <em>how much</em> holds up. Answer what you can.
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: textLt, margin: "0 0 22px" }}>
          A general read under Tex. Bus. &amp; Com. Code § 15.50 — not legal advice.
        </p>

        <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: "6px 18px 16px" }}>
          {yesNo("Did you get something in exchange (confidential info, training, equity)?", input.receivedConsideration, (v) => set({ receivedConsideration: v, ancillaryToAgreement: v }))}
          {yesNo("Does the employer have a real interest to protect (trade secrets, clients)?", input.protectableInterest, (v) => set({ protectableInterest: v }))}
          {row("How long does the restriction last?",
            <select style={fieldStyle()} value={input.timeMonths ?? ""} onChange={(e) => set({ timeMonths: e.target.value === "" ? undefined : Number(e.target.value) })}>
              <option value="">Not sure</option><option value="6">6 months</option><option value="12">1 year</option><option value="24">2 years</option><option value="36">3 years</option><option value="60">5 years</option>
            </select>
          )}
          {row("Geographic reach vs. where you worked?",
            <select style={fieldStyle()} value={input.geography ?? ""} onChange={(e) => set({ geography: (e.target.value || undefined) as NoncompeteInput["geography"] })}>
              <option value="">Not sure</option><option value="reasonable">Matches where I worked</option><option value="broad">Much broader (statewide/national)</option><option value="none_specified">No limit stated</option>
            </select>
          )}
          {row("Scope of restricted activity vs. your role?",
            <select style={fieldStyle()} value={input.activityScope ?? ""} onChange={(e) => set({ activityScope: (e.target.value || undefined) as NoncompeteInput["activityScope"] })}>
              <option value="">Not sure</option><option value="narrow">Limited to my actual job</option><option value="broad">A whole industry</option>
            </select>
          )}
          <button onClick={() => setSubmitted(true)} style={{ marginTop: 16, padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: "pointer" }}>
            Check enforceability →
          </button>
        </div>

        {a && (
          <section style={{ marginTop: 24 }}>
            <div style={{ background: VERDICT_STYLE[a.enforceability].bg, border: `1px solid ${VERDICT_STYLE[a.enforceability].color}`, borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 15.5, fontWeight: 600, color: VERDICT_STYLE[a.enforceability].color, margin: 0, lineHeight: 1.45 }}>{a.headline}</p>
            </div>

            <div style={{ marginTop: 16, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
              <h3 style={sectionLabel}>The § 15.50 test</h3>
              <ul style={{ listStyle: "none", margin: "0 0 8px", padding: 0 }}>
                {a.factors.map((f, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: i < a.factors.length - 1 ? `1px solid ${border}` : "none" }}>
                    <span style={{ color: FACTOR_COLOR[f.status], fontWeight: 700, flexShrink: 0 }}>{FACTOR_MARK[f.status]}</span>
                    <span style={{ fontSize: 13.5, color: textMd, lineHeight: 1.5 }}><strong style={{ color: navy }}>{f.factor}.</strong> {f.note}</span>
                  </li>
                ))}
              </ul>

              <p style={{ fontSize: 13, lineHeight: 1.55, color: textMd, margin: "10px 0", background: "rgba(200,169,110,0.1)", borderRadius: 8, padding: "10px 12px" }}>{a.reformationNote}</p>

              <h3 style={sectionLabel}>Ways to negotiate it down</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {a.negotiationLevers.map((l, i) => <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5, color: textMd, marginBottom: 5 }}>{l}</li>)}
              </ul>

              <h3 style={sectionLabel}>Documents that help</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {a.relevant_instruments.map((key) => {
                  const inst = getEmploymentInstrument(key);
                  if (!inst) return null;
                  return <Link key={key} href={wizardHref(inst.wizard_type)} style={{ fontSize: 13.5, fontWeight: 500, color: navy, background: gold, padding: "9px 14px", borderRadius: 8, textDecoration: "none" }}>{inst.label} →</Link>;
                })}
              </div>

              <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "18px 0 0", borderTop: `1px solid ${border}`, paddingTop: 12 }}>{a.disclaimer}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

const sectionLabel = { fontSize: 12.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "var(--brand-text-md)", margin: "16px 0 8px" };

export default function NoncompetePage() {
  return (
    <Suspense fallback={null}>
      <Noncompete />
    </Suspense>
  );
}
