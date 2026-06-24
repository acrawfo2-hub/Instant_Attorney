"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Texas guideline child-support estimator — a standalone, free tool.
//
// It calls /api/family/child-support (pure compute, no AI, no token spend) and
// shows a guideline estimate. When opened from a file (?caseFileId=), the
// estimate is saved into the Living File as a confirmed fact, so a Child Support
// Order or decree drafted later seeds from the number. It never changes which
// wizards are recommended — same "add value, don't disturb the pipeline" rule
// the What-If Game follows.
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

interface Estimate {
  applicablePercentage: number;
  cappedNetResources: number;
  monthlyAmount: number;
  capApplied: boolean;
  capUsed: number;
  multipleFamilyAdjusted: boolean;
  assumptions: string[];
  disclaimer: string;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Estimator() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [net, setNet] = useState("");
  const [children, setChildren] = useState("1");
  const [otherChildren, setOtherChildren] = useState("0");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const netNum = Number(net);
  const canSubmit = Number.isFinite(netNum) && netNum > 0 && Number(children) >= 1;

  async function estimateNow() {
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch("/api/family/child-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          netMonthlyResources: netNum,
          childrenBeforeCourt: Number(children),
          otherChildren: Number(otherChildren) || 0,
          caseFileId: caseFileId ?? undefined,
        }),
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
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Child Support Estimator</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free estimate · no account charge · won't change your documents
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          Texas child-support estimate
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 8px" }}>
          Texas sets child support as a percentage of the paying parent&apos;s monthly{" "}
          <em>net resources</em> — 20% for one child, 25% for two, and so on. Enter a few numbers for a
          guideline estimate.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: textLt, margin: "0 0 24px" }}>
          {caseFileId
            ? "We'll save the estimate to your file so a support order or decree can use it later."
            : "Open this from one of your files and we'll save the estimate so your documents can use it."}
        </p>

        <div style={{ display: "grid", gap: 16, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
          <div>
            <label style={labelStyle}>Paying parent&apos;s monthly net resources</label>
            <input
              type="number"
              inputMode="decimal"
              value={net}
              onChange={(e) => setNet(e.target.value)}
              placeholder="e.g. 5000"
              style={fieldStyle}
            />
            <p style={{ fontSize: 12.5, color: textLt, margin: "6px 0 0" }}>
              Roughly take-home pay after taxes, union dues, and the child&apos;s health/dental
              insurance — defined by statute, so it may differ from net pay.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Children in this case</label>
              <select value={children} onChange={(e) => setChildren(e.target.value)} style={fieldStyle}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {n === 7 ? "+" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Other children supported</label>
              <select value={otherChildren} onChange={(e) => setOtherChildren(e.target.value)} style={fieldStyle}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {n === 7 ? "+" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p style={{ color: "#b4341f", fontSize: 14, margin: 0 }}>{error}</p>}

          <button
            onClick={estimateNow}
            disabled={!canSubmit || loading}
            style={{ padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: canSubmit && !loading ? "pointer" : "default", opacity: canSubmit && !loading ? 1 : 0.5 }}
          >
            {loading ? "Estimating…" : "Estimate support →"}
          </button>
        </div>

        {estimate && (
          <section style={{ marginTop: 28, background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: 24 }}>
            <p style={{ fontSize: 13, letterSpacing: 0.5, color: gold, margin: "0 0 6px" }}>
              ESTIMATED GUIDELINE SUPPORT
            </p>
            <p style={{ fontFamily: serif, fontSize: 44, lineHeight: 1.1, margin: "0 0 4px" }}>
              {usd(estimate.monthlyAmount)}
              <span style={{ fontSize: 18, fontFamily: "inherit" }}> /month</span>
            </p>
            <p style={{ fontSize: 14.5, color: "rgba(255,255,255,0.82)", margin: "0 0 16px" }}>
              {estimate.applicablePercentage}% of {usd(estimate.cappedNetResources)} in net resources
              {estimate.multipleFamilyAdjusted ? " (adjusted for other children)" : ""}.
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

            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.55, margin: 0 }}>
              {estimate.disclaimer}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default function ChildSupportPage() {
  return (
    <Suspense fallback={null}>
      <Estimator />
    </Suspense>
  );
}
