"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  recommendEstatePlan,
  trustVerdict,
  estatePlanDisclaimer,
  type PlanSignals,
  type Fit,
} from "@/lib/estate-planning";

// ─────────────────────────────────────────────────────────────────────────────
// Estate-planning pathfinder — a free, informational tool that demystifies
// trusts for the middle class. Pure client render over lib/estate-planning.ts
// (no AI, no API). Answer a few plain questions and the right instruments
// re-rank, each with when it fits, what it costs, and what to watch for. The
// honest thesis: most Texas estates don't need an expensive trust. Changes
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
  essential: { bg: "rgba(45,122,79,0.14)", color: "#2d7a4f", label: "Essential" },
  strong: { bg: "rgba(200,169,110,0.20)", color: "#8a6d2f", label: "Strong fit" },
  consider: { bg: "rgba(70,110,160,0.14)", color: "#3a5e86", label: "Worth weighing" },
  optional: { bg: "rgba(120,120,120,0.14)", color: "#666", label: "Optional" },
};

type Tri = "unknown" | "yes" | "no";
const triToBool = (t: Tri): boolean | undefined => (t === "yes" ? true : t === "no" ? false : undefined);

function PlannerTool() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [ownsHome, setOwnsHome] = useState<Tri>("unknown");
  const [minorChildren, setMinorChildren] = useState<Tri>("unknown");
  const [blendedFamily, setBlendedFamily] = useState<Tri>("unknown");
  const [outOfState, setOutOfState] = useState<Tri>("unknown");
  const [disabledBeneficiary, setDisabledBeneficiary] = useState<Tri>("unknown");
  const [wantsPrivacy, setWantsPrivacy] = useState<Tri>("unknown");
  const [wantsIncapacity, setWantsIncapacity] = useState<Tri>("unknown");
  const [largerEstate, setLargerEstate] = useState<Tri>("unknown");

  const signals: PlanSignals = {
    ownsHome: triToBool(ownsHome),
    minorChildren: triToBool(minorChildren),
    blendedFamily: triToBool(blendedFamily),
    outOfStateRealEstate: triToBool(outOfState),
    disabledBeneficiary: triToBool(disabledBeneficiary),
    wantsPrivacy: triToBool(wantsPrivacy),
    wantsIncapacityManagement: triToBool(wantsIncapacity),
    largerEstate: triToBool(largerEstate),
  };
  const ranked = recommendEstatePlan(signals);
  const verdict = trustVerdict(signals);

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
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Estate Planning · Do I Need a Trust?</span>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · plain-English guidance · changes nothing in your file
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          Do I really need a trust?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 16px" }}>
          The estate-planning industry can make trusts sound mandatory. For most middle-class
          Texans, they aren&apos;t. Texas has <strong>independent administration</strong> (which keeps
          probate relatively cheap and fast) and <strong>no state death tax</strong>, so the real goal
          is usually a smooth, low-cost transfer — not avoiding taxes. Answer what you can and
          we&apos;ll show you the plan that actually fits.
        </p>

        <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: "6px 18px 14px" }}>
          {question("Do you own a home or other real estate?", ownsHome, setOwnsHome)}
          {question("Do you have minor children?", minorChildren, setMinorChildren)}
          {question("Is yours a blended family (a prior marriage, step-children)?", blendedFamily, setBlendedFamily)}
          {question("Do you own real estate in another state?", outOfState, setOutOfState)}
          {question("Does a loved one have a disability and rely on benefits (SSI/Medicaid)?", disabledBeneficiary, setDisabledBeneficiary)}
          {question("Do you specifically want your plan kept private (probate is public)?", wantsPrivacy, setWantsPrivacy)}
          {question("Do you want hands-on management of your assets if you're incapacitated?", wantsIncapacity, setWantsIncapacity)}
          {question("Is your estate larger or complex (several properties, a business)?", largerEstate, setLargerEstate)}
        </div>

        {/* Headline verdict on the trust question */}
        <div style={{ marginTop: 22, background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: gold, marginBottom: 6 }}>
            The trust question
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.5, margin: 0 }}>{verdict}</p>
        </div>

        <h2 style={{ fontFamily: serif, fontSize: 22, margin: "30px 0 6px" }}>Your plan, ranked</h2>
        <p style={{ fontSize: 13.5, color: textLt, margin: "0 0 16px" }}>
          Start at the top. Essentials come first, then anything that earns its cost for your situation.
        </p>

        <div style={{ display: "grid", gap: 14 }}>
          {ranked.map((i) => {
            const fs = FIT_STYLE[i.fit];
            return (
              <div key={i.key} style={{ background: "var(--brand-white)", border: `1px solid ${i.fit === "essential" || i.fit === "strong" ? gold : border}`, borderRadius: 12, padding: 18, opacity: i.fit === "optional" ? 0.72 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: navy, fontFamily: serif }}>{i.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: fs.color, background: fs.bg, padding: "2px 8px", borderRadius: 999 }}>
                    {fs.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: textLt, marginBottom: 8 }}>{i.costBand}</div>
                <p style={{ fontSize: 13.5, color: textMd, lineHeight: 1.55, margin: "0 0 8px" }}>{i.summary}</p>
                <p style={{ fontSize: 13, color: textLt, margin: "0 0 10px", fontStyle: "italic" }}>{i.reason}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <div style={miniLabel}>Best when</div>
                    <ul style={miniList}>{i.bestWhen.map((x, k) => <li key={k}>{x}</li>)}</ul>
                  </div>
                  <div>
                    <div style={{ ...miniLabel, color: "#b4341f" }}>Watch out</div>
                    <ul style={miniList}>{i.watchOut.map((x, k) => <li key={k}>{x}</li>)}</ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Next steps: the practical checklist + the What-If reflection */}
        <div style={{ marginTop: 28, display: "grid", gap: 12 }}>
          <Link href={caseFileId ? `/estate/checklist?caseFileId=${caseFileId}` : "/estate/checklist"} style={nextCard}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: navy }}>Next: your get-ready checklist →</div>
              <div style={{ fontSize: 13, color: textMd, marginTop: 3, lineHeight: 1.5 }}>
                Most of the work isn&apos;t legal — naming beneficiaries, moving money, and organizing
                your passwords so your family can find everything. The checklist walks you through it.
              </div>
            </div>
          </Link>
          <Link href={caseFileId ? `/what-if?caseFileId=${caseFileId}` : "/what-if"} style={nextCard}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: navy }}>Play the What-If game →</div>
              <div style={{ fontSize: 13, color: textMd, marginTop: 3, lineHeight: 1.5 }}>
                &ldquo;What if I&apos;m incapacitated? What if a child isn&apos;t ready for money at 18?&rdquo;
                Playing it captures those worries so they get built into your strategy and the
                documents we draft — not left as loose ends.
              </div>
            </div>
          </Link>
        </div>

        <div style={{ marginTop: 16, background: "rgba(200,169,110,0.08)", border: `1px solid ${border}`, borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: navy, marginBottom: 4 }}>Ready to put a plan in place?</div>
          <p style={{ fontSize: 13.5, color: textMd, lineHeight: 1.55, margin: "0 0 12px" }}>
            Start a privileged conversation and we&apos;ll turn this into a concrete plan and draft the
            documents you actually need — reviewed by an attorney before you sign.
          </p>
          <Link href="/chat?area=estate" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: gold, color: "#1a1008", padding: "9px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}>
            Start my estate plan →
          </Link>
        </div>

        <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "18px 2px 0" }}>{estatePlanDisclaimer()}</p>
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
const nextCard = {
  display: "block",
  background: "var(--brand-white)",
  border: "1px solid var(--brand-border)",
  borderRadius: 12,
  padding: "14px 16px",
  textDecoration: "none",
};

export default function EstatePlannerPage() {
  return (
    <Suspense fallback={null}>
      <PlannerTool />
    </Suspense>
  );
}
