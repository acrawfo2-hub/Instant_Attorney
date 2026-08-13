"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  assessDefamation,
  type DefamationInput,
  type ElementStatus,
  type Strength,
} from "@/lib/defamation-assessment";
import { getDefamationInstrument } from "@/lib/defamation-instruments";

// ─────────────────────────────────────────────────────────────────────────────
// Defamation case assessment — a free, informational tool. Pure client render
// over lib/defamation-assessment.ts (no AI, no API). Answer what you can and see
// an honest read on your claim — including the one-year deadline and the
// anti-SLAPP fee risk. It changes nothing in your file.
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

const STRENGTH_STYLE: Record<Strength, { bg: string; color: string }> = {
  potentially_viable: { bg: "rgba(45,122,79,0.14)", color: "#2d7a4f" },
  uphill: { bg: "rgba(200,169,110,0.2)", color: "#8a6d2f" },
  needs_more_info: { bg: "rgba(120,120,120,0.14)", color: "#555" },
  likely_not: { bg: "rgba(180,52,31,0.1)", color: "#b4341f" },
};
const ELEMENT_COLOR: Record<ElementStatus, string> = {
  met: "#2d7a4f",
  not_met: "#b4341f",
  concern: "#8a6d2f",
  unclear: "#999",
};
const ELEMENT_MARK: Record<ElementStatus, string> = { met: "✓", not_met: "✕", concern: "!", unclear: "?" };

function fieldStyle() {
  return {
    boxSizing: "border-box" as const,
    padding: "9px 10px",
    fontSize: 14,
    border: `1px solid ${border}`,
    borderRadius: 7,
    fontFamily: "inherit",
    color: textDk,
    background: "var(--brand-white)",
    width: "100%",
  };
}

function Assess() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const [input, setInput] = useState<DefamationInput>({});
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<DefamationInput>) => setInput((p) => ({ ...p, ...patch }));
  const a = submitted ? assessDefamation(input) : null;

  // Hands the request to the orchestrator rather than opening a second
  // drafting client. Drafting happens inside that conversation now
  // (lib/document-drafting.ts), not on a page the client clicks through.
  // `ask` only seeds the composer — she still reads it and presses send.
  const instrumentActionHref = (instrumentType: string, label?: string) =>
    caseFileId
      ? `/chat?caseFileId=${caseFileId}&ask=${encodeURIComponent(`Please draft the ${label ?? instrumentType.replace(/_/g, " ")} for my matter.`)}`
      : "/free-chat?area=defamation";

  const row = (label: string, control: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${border}` }}>
      <span style={{ fontSize: 14, color: textMd }}>{label}</span>
      {control}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Defamation Check</span>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · an honest read · changes nothing in your file
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          Do I have a defamation case?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 22px" }}>
          Defamation is common online but tricky in the law. Answer what you can — leave the rest on
          &ldquo;Not sure&rdquo; — and we&apos;ll walk the pieces honestly, including the one-year deadline and the
          anti-SLAPP fee risk most people never hear about.
        </p>

        <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: "6px 18px 16px" }}>
          {row("Is it a statement of fact, or someone's opinion?",
            <select style={fieldStyle()} value={input.statementType ?? ""} onChange={(e) => set({ statementType: (e.target.value || undefined) as DefamationInput["statementType"] })}>
              <option value="">Not sure</option>
              <option value="fact">A statement of fact</option>
              <option value="opinion">An opinion</option>
            </select>
          )}
          {input.statementType === "fact" && row("Is that statement actually false?",
            <select style={fieldStyle()} value={input.isFalse === undefined ? "" : input.isFalse ? "yes" : "no"} onChange={(e) => set({ isFalse: e.target.value === "" ? undefined : e.target.value === "yes" })}>
              <option value="">Not sure</option>
              <option value="yes">Yes, it&apos;s false</option>
              <option value="no">No / it&apos;s true</option>
            </select>
          )}
          {row("Did anyone else see or hear it?",
            <select style={fieldStyle()} value={input.publishedToOthers === undefined ? "" : input.publishedToOthers ? "yes" : "no"} onChange={(e) => set({ publishedToOthers: e.target.value === "" ? undefined : e.target.value === "yes" })}>
              <option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          )}
          {row("Is it about you (does it identify you)?",
            <select style={fieldStyle()} value={input.aboutYou === undefined ? "" : input.aboutYou ? "yes" : "no"} onChange={(e) => set({ aboutYou: e.target.value === "" ? undefined : e.target.value === "yes" })}>
              <option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          )}
          {row("Are you a public figure or official?",
            <select style={fieldStyle()} value={input.plaintiffStatus ?? ""} onChange={(e) => set({ plaintiffStatus: (e.target.value || undefined) as DefamationInput["plaintiffStatus"] })}>
              <option value="">Not sure</option>
              <option value="private">No — private person</option>
              <option value="public_figure">Public figure</option>
              <option value="public_official">Public official</option>
            </select>
          )}
          {row("Does it falsely accuse you of something serious?",
            <select style={fieldStyle()} value={input.perSeCategory ?? ""} onChange={(e) => set({ perSeCategory: (e.target.value || undefined) as DefamationInput["perSeCategory"] })}>
              <option value="">Not sure</option>
              <option value="crime">A crime</option>
              <option value="business_profession">Professional/business misconduct</option>
              <option value="sexual">Sexual misconduct</option>
              <option value="disease">A loathsome disease</option>
              <option value="none">None of these</option>
            </select>
          )}
          {row("Is it about a public issue (a review, public criticism)?",
            <select style={fieldStyle()} value={input.matterOfPublicConcern === undefined ? "" : input.matterOfPublicConcern ? "yes" : "no"} onChange={(e) => set({ matterOfPublicConcern: e.target.value === "" ? undefined : e.target.value === "yes" })}>
              <option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          )}
          {row("How many months ago was it published?",
            <input type="number" inputMode="numeric" style={fieldStyle()} placeholder="e.g. 3" value={input.monthsSincePublished ?? ""} onChange={(e) => set({ monthsSincePublished: e.target.value === "" ? undefined : Number(e.target.value) })} />
          )}
          {row("Do you know who said it?",
            <select style={fieldStyle()} value={input.speakerKnown === undefined ? "" : input.speakerKnown ? "yes" : "no"} onChange={(e) => set({ speakerKnown: e.target.value === "" ? undefined : e.target.value === "yes" })}>
              <option value="">Not sure</option><option value="yes">Yes</option><option value="no">No — anonymous</option>
            </select>
          )}

          <button
            onClick={() => setSubmitted(true)}
            style={{ marginTop: 16, padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            Assess my situation →
          </button>
        </div>

        {a && (
          <section style={{ marginTop: 24 }}>
            <div style={{ background: STRENGTH_STYLE[a.strength].bg, border: `1px solid ${STRENGTH_STYLE[a.strength].color}`, borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 15.5, fontWeight: 600, color: STRENGTH_STYLE[a.strength].color, margin: 0, lineHeight: 1.45 }}>{a.headline}</p>
            </div>

            <div style={{ marginTop: 16, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
              <h3 style={sectionLabel}>The pieces of a claim</h3>
              <ul style={{ listStyle: "none", margin: "0 0 8px", padding: 0 }}>
                {a.elements.map((e, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: i < a.elements.length - 1 ? `1px solid ${border}` : "none" }}>
                    <span style={{ color: ELEMENT_COLOR[e.status], fontWeight: 700, flexShrink: 0 }}>{ELEMENT_MARK[e.status]}</span>
                    <span style={{ fontSize: 13.5, color: textMd, lineHeight: 1.5 }}><strong style={{ color: navy }}>{e.element}.</strong> {e.note}</span>
                  </li>
                ))}
              </ul>

              {a.warnings.length > 0 && (
                <>
                  <h3 style={{ ...sectionLabel, color: "#b4341f" }}>Important warnings</h3>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {a.warnings.map((w, i) => (
                      <li key={i} style={{ fontSize: 13.5, lineHeight: 1.55, color: w.severe ? "#b4341f" : textMd, fontWeight: w.severe ? 600 : 400, marginBottom: 6 }}>{w.text}</li>
                    ))}
                  </ul>
                </>
              )}

              <h3 style={sectionLabel}>What you can do</h3>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {a.actions.map((x, i) => (
                  <li key={i} style={{ fontSize: 13.5, lineHeight: 1.55, color: textMd, marginBottom: 7 }}>
                    {x.urgent && <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#b4341f", background: "rgba(180,52,31,0.1)", padding: "2px 6px", borderRadius: 4, marginRight: 6 }}>Now</span>}
                    <span style={{ fontWeight: 500 }}>{x.step}</span>
                    {x.why && <span style={{ color: textLt }}> — {x.why}</span>}
                  </li>
                ))}
              </ol>

              {a.relevant_instruments.length > 0 && (
                <>
                  <h3 style={sectionLabel}>Letters that can help</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {a.relevant_instruments.map((key) => {
                      const inst = getDefamationInstrument(key);
                      if (!inst) return null;
                      return (
                        <Link key={key} href={instrumentActionHref(inst.engine, inst.label)} style={{ fontSize: 13.5, fontWeight: 500, color: navy, background: gold, padding: "9px 14px", borderRadius: 8, textDecoration: "none" }}>
                          {inst.label} →
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}

              <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "18px 0 0", borderTop: `1px solid ${border}`, paddingTop: 12 }}>{a.disclaimer}</p>
            </div>
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
  margin: "16px 0 8px",
};

export default function DefamationAssessPage() {
  return (
    <Suspense fallback={null}>
      <Assess />
    </Suspense>
  );
}
