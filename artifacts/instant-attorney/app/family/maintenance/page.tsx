"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Texas spousal-maintenance (Chapter 8) eligibility screen — a standalone, free
// tool. Calls /api/family/maintenance (pure compute, no AI, no token spend).
// When opened from a file (?caseFileId=), the screen is saved as a confirmed
// fact, so a decree's maintenance terms seed from it. It never changes which
// instruments are recommended.
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

interface Screen {
  eligible: boolean;
  grounds: string[];
  likelyMaxDurationYears: number | null;
  durationNote: string;
  amountCapMonthly: number | null;
  amountNote: string;
  presumptionNote: string | null;
  assumptions: string[];
  disclaimer: string;
}

function MaintenanceTool() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [marriageYears, setMarriageYears] = useState("");
  const [lacksMinimumNeeds, setLacksMinimumNeeds] = useState(false);
  const [familyViolence, setFamilyViolence] = useState(false);
  const [seekingSpouseDisability, setSeekingSpouseDisability] = useState(false);
  const [childWithDisabilityCare, setChildWithDisabilityCare] = useState(false);
  const [gross, setGross] = useState("");
  const [screen, setScreen] = useState<Screen | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Number(marriageYears) >= 0 && marriageYears !== "";

  async function run() {
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch("/api/family/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marriageYears: Number(marriageYears),
          lacksMinimumNeeds,
          familyViolence,
          seekingSpouseDisability,
          childWithDisabilityCare,
          payorAverageMonthlyGrossIncome: gross ? Number(gross) : undefined,
          caseFileId: caseFileId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.screen) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setScreen(data.screen as Screen);
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
  const check = (checked: boolean, set: (v: boolean) => void, text: string) => (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: textMd, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} style={{ marginTop: 3 }} />
      <span>{text}</span>
    </label>
  );

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Spousal Maintenance Screen</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · a quick read on Texas spousal maintenance
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          Could there be spousal maintenance?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 8px" }}>
          Texas keeps court-ordered spousal maintenance narrow. Answer a few questions for an honest read
          on whether it&apos;s on the table, and roughly how much and how long.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: textLt, margin: "0 0 24px" }}>
          {caseFileId
            ? "We'll save the result to your file so a decree can use it."
            : "Open this from one of your files and we'll save the result so your documents can use it."}
        </p>

        <div style={{ display: "grid", gap: 16, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
          <div>
            <label style={labelStyle}>How long was the marriage? (years)</label>
            <input type="number" inputMode="decimal" value={marriageYears} onChange={(e) => setMarriageYears(e.target.value)} placeholder="e.g. 12" style={{ ...field, width: "100%" }} />
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {check(lacksMinimumNeeds, setLacksMinimumNeeds, "The spouse seeking support can't meet their minimum reasonable needs from their own property and income.")}
            {check(familyViolence, setFamilyViolence, "The other spouse was convicted of or got deferred adjudication for family violence within the statutory window.")}
            {check(seekingSpouseDisability, setSeekingSpouseDisability, "The spouse seeking support has an incapacitating physical or mental disability.")}
            {check(childWithDisabilityCare, setChildWithDisabilityCare, "That spouse cares for a child of the marriage with a disability that requires substantial care.")}
          </div>

          <div>
            <label style={labelStyle}>Paying spouse&apos;s average monthly gross income (optional)</label>
            <input type="number" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="e.g. 8000 — used for the amount cap" style={{ ...field, width: "100%" }} />
          </div>

          {error && <p style={{ color: "#b4341f", fontSize: 14, margin: 0 }}>{error}</p>}

          <button
            onClick={run}
            disabled={!canSubmit || loading}
            style={{ padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: canSubmit && !loading ? "pointer" : "default", opacity: canSubmit && !loading ? 1 : 0.5 }}
          >
            {loading ? "Checking…" : "Check eligibility →"}
          </button>
        </div>

        {screen && (
          <section style={{ marginTop: 28, background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: 24 }}>
            <p style={{ fontSize: 13, letterSpacing: 0.5, color: gold, margin: "0 0 6px" }}>SCREEN RESULT</p>
            <p style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.15, margin: "0 0 14px" }}>
              {screen.eligible ? "Maintenance may be available" : "Likely not eligible on these facts"}
            </p>

            {screen.eligible && (
              <>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 4px" }}>Why it may qualify</p>
                <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>
                  {screen.grounds.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.55, margin: "0 0 10px" }}>
                  <strong style={{ color: gold }}>Duration:</strong> {screen.durationNote}
                </p>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.55, margin: "0 0 10px" }}>
                  <strong style={{ color: gold }}>Amount:</strong> {screen.amountNote}
                </p>
                {screen.presumptionNote && (
                  <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.82)", lineHeight: 1.55, margin: "0 0 10px" }}>
                    {screen.presumptionNote}
                  </p>
                )}
              </>
            )}

            {screen.assumptions.length > 0 && (
              <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13.5, color: "rgba(255,255,255,0.82)", lineHeight: 1.6 }}>
                {screen.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}

            {caseFileId && (
              <p style={{ fontSize: 13, color: saved ? gold : "rgba(255,255,255,0.7)", margin: "0 0 12px" }}>
                {saved ? "✓ Saved to your file — your documents can use this." : "Not saved to your file."}
              </p>
            )}

            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.55, margin: 0 }}>{screen.disclaimer}</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <Suspense fallback={null}>
      <MaintenanceTool />
    </Suspense>
  );
}
