"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  estimateProbateVsTrust,
  estateProbateDisclaimer,
  type EstateProfile,
  type EstateSize,
  type CostRange,
  type PathKey,
} from "@/lib/estate-probate-estimate";

// ─────────────────────────────────────────────────────────────────────────────
// Probate cost vs. trust estimator — puts rough Texas dollars on the trade-off.
// Pure client render over lib/estate-probate-estimate.ts (no AI, no API). Honest
// by design: for a simple estate the will-plus-tools path is usually cheapest;
// a couple or out-of-state property is where a trust tends to pay off. Changes
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

const usd = (n: number) => `$${n.toLocaleString()}`;
const fmtRange = (r: CostRange) => (r.low === r.high ? usd(r.low) : `${usd(r.low)}–${usd(r.high)}`);
const fmtMonths = (r: CostRange) =>
  r.high === 0 ? "≈ immediate" : r.low === r.high ? `${r.low} mo` : `${r.low}–${r.high} months`;

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: `1px solid ${border}` }}>
      <span style={{ fontSize: 14, color: textMd }}>{label}</span>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {([["Yes", true], ["No", false]] as [string, boolean][]).map(([t, v]) => (
          <button
            key={t}
            onClick={() => onChange(v)}
            style={{
              fontSize: 12.5,
              padding: "5px 14px",
              borderRadius: 7,
              border: `1px solid ${value === v ? gold : border}`,
              background: value === v ? "rgba(200,169,110,0.16)" : "var(--brand-white)",
              color: navy,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

const SIZE_LABELS: Record<EstateSize, string> = {
  modest: "Modest (under ~$250k)",
  moderate: "Moderate (~$250k–$1M)",
  substantial: "Substantial (over ~$1M)",
};

const PATH_ACCENT: Record<PathKey, string> = {
  will_only: border,
  will_plus_tools: gold,
  trust_based: gold,
};

function Feature({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: on ? "#2d7a4f" : textLt }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {on ? <polyline points="20 6 9 17 4 12" /> : <line x1="5" y1="12" x2="19" y2="12" />}
      </svg>
      {label}
    </span>
  );
}

function EstimatorTool() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");
  const withCase = (path: string) => (caseFileId ? `${path}?caseFileId=${caseFileId}` : path);

  const [married, setMarried] = useState(false);
  const [ownsHome, setOwnsHome] = useState(true);
  const [outOfState, setOutOfState] = useState(false);
  const [estateSize, setEstateSize] = useState<EstateSize>("modest");
  const [useTools, setUseTools] = useState(true);

  const profile: EstateProfile = { married, ownsHome, outOfStateRealEstate: outOfState, estateSize, useNonProbateTools: useTools };
  const { paths, cheapestTotalKey, verdict } = estimateProbateVsTrust(profile);

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Estate Planning · Probate vs. Trust Cost</span>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · rough planning estimates · changes nothing in your file
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          What will probate actually cost — vs. a trust?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 22px" }}>
          The honest answer is &ldquo;it depends,&rdquo; so let&apos;s put rough numbers on it. We&apos;ll
          compare three paths — a plain will, a will plus the cheap probate-avoidance tools, and a
          living trust — for your situation. These are <strong>estimates</strong>, not a quote.
        </p>

        <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: "6px 18px 16px" }}>
          <Toggle label="Are you married?" value={married} onChange={setMarried} />
          <Toggle label="Do you own a home or other Texas real estate?" value={ownsHome} onChange={setOwnsHome} />
          <Toggle label="Do you own real estate in another state?" value={outOfState} onChange={setOutOfState} />
          <Toggle label="Are you willing to use TOD deeds & beneficiary forms?" value={useTools} onChange={setUseTools} />
          <div style={{ padding: "12px 0 2px" }}>
            <div style={{ fontSize: 14, color: textMd, marginBottom: 8 }}>Roughly how large is the estate?</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(Object.keys(SIZE_LABELS) as EstateSize[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setEstateSize(s)}
                  style={{
                    fontSize: 12.5,
                    padding: "6px 12px",
                    borderRadius: 7,
                    border: `1px solid ${estateSize === s ? gold : border}`,
                    background: estateSize === s ? "rgba(200,169,110,0.16)" : "var(--brand-white)",
                    color: navy,
                    cursor: "pointer",
                  }}
                >
                  {SIZE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Verdict */}
        <div style={{ marginTop: 22, background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: gold, marginBottom: 6 }}>
            The bottom line
          </div>
          <p style={{ fontSize: 15.5, lineHeight: 1.55, margin: 0 }}>{verdict}</p>
        </div>

        {/* Path cards */}
        <div style={{ marginTop: 22, display: "grid", gap: 14 }}>
          {paths.map((p) => {
            const isCheapest = p.key === cheapestTotalKey;
            return (
              <div key={p.key} style={{ background: "var(--brand-white)", border: `1px solid ${isCheapest ? gold : PATH_ACCENT[p.key]}`, borderRadius: 12, padding: 18, boxShadow: isCheapest ? "0 6px 20px rgba(200,169,110,0.18)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: navy, fontFamily: serif }}>{p.label}</span>
                  {isCheapest && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#8a6d2f", background: "rgba(200,169,110,0.2)", padding: "2px 8px", borderRadius: 999 }}>
                      Lowest estimated total
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: textLt, textTransform: "uppercase", letterSpacing: "0.04em" }}>Est. total</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: navy }}>{fmtRange(p.total)}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: textMd }}>
                    <div>Set up now: <strong>{fmtRange(p.upfront)}</strong></div>
                    <div>Settle later: <strong>{fmtRange(p.atDeath)}</strong></div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, marginBottom: 10 }}>
                  <span style={{ fontSize: 11.5, color: textLt }}>
                    {p.probateProceedings === 0 ? "No probate" : `${p.probateProceedings} probate proceeding${p.probateProceedings > 1 ? "s" : ""}`}
                  </span>
                  <Feature on={p.avoidsProbate} label="Avoids probate" />
                  <Feature on={p.privacy} label="Private" />
                  <Feature on={p.incapacityCoverage} label="Incapacity covered" />
                  <span style={{ fontSize: 11.5, color: textLt }}>Settles in {fmtMonths(p.settlementMonths)}</span>
                </div>

                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.55, color: textMd }}>
                  {p.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Cross-links */}
        <div style={{ marginTop: 26, display: "grid", gap: 12 }}>
          <Link href={withCase("/estate/planner")} style={nextCard}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: navy }}>Still deciding? Try the trust pathfinder →</div>
            <div style={{ fontSize: 13, color: textMd, marginTop: 3, lineHeight: 1.5 }}>
              Walks the non-cost factors — privacy, incapacity, blended families, special needs — that the dollars alone don&apos;t capture.
            </div>
          </Link>
          <Link href={withCase("/estate/checklist")} style={nextCard}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: navy }}>Ready to act? The get-ready checklist →</div>
            <div style={{ fontSize: 13, color: textMd, marginTop: 3, lineHeight: 1.5 }}>
              The mostly do-it-yourself steps — beneficiaries, retitling, passwords — that make any of these plans actually work.
            </div>
          </Link>
        </div>

        <div style={{ marginTop: 16, background: "rgba(200,169,110,0.08)", border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: navy, marginBottom: 4 }}>Want a real number for your situation?</div>
          <p style={{ fontSize: 13.5, color: textMd, lineHeight: 1.55, margin: "0 0 12px" }}>
            Start a privileged conversation and we&apos;ll price the right plan for your assets and draft
            the documents — reviewed by an attorney before you sign.
          </p>
          <Link href="/chat?area=estate" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: gold, color: "#1a1008", padding: "9px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}>
            Start my estate plan →
          </Link>
        </div>

        <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "18px 2px 0" }}>{estateProbateDisclaimer()}</p>
      </main>
    </div>
  );
}

const nextCard = {
  display: "block",
  background: "var(--brand-white)",
  border: "1px solid var(--brand-border)",
  borderRadius: 12,
  padding: "14px 16px",
  textDecoration: "none",
};

export default function EstateEstimatePage() {
  return (
    <Suspense fallback={null}>
      <EstimatorTool />
    </Suspense>
  );
}
