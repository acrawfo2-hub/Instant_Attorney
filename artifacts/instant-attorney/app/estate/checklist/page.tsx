"use client";

import { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  tasksByCategory,
  estateChecklistDisclaimer,
  selfServiceCount,
  ESTATE_TASKS,
  type Doer,
} from "@/lib/estate-checklist";

// ─────────────────────────────────────────────────────────────────────────────
// Estate "get ready" checklist — the practical, mostly non-legal prep that makes
// a legal plan actually work: naming beneficiaries, moving/retitling money,
// organizing passwords, and telling the right people. Pure client render over
// lib/estate-checklist.ts. The What-If game is a first-class step so a person's
// hypothetical worries get captured and built into their strategy over time.
// Free, no AI, changes nothing in your file.
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

const DOER_STYLE: Record<Doer, { bg: string; color: string; label: string }> = {
  you: { bg: "rgba(45,122,79,0.13)", color: "#2d7a4f", label: "You can do this" },
  together: { bg: "rgba(200,169,110,0.2)", color: "#8a6d2f", label: "You + your attorney" },
  attorney: { bg: "rgba(70,110,160,0.14)", color: "#3a5e86", label: "Attorney drafts" },
};

function ChecklistTool() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");
  const chatHref = caseFileId ? `/chat?caseFileId=${caseFileId}` : "/chat?area=estate";
  const whatIfHref = caseFileId ? `/what-if?caseFileId=${caseFileId}` : "/what-if";

  const groups = useMemo(() => tasksByCategory(), []);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setDone((d) => ({ ...d, [key]: !d[key] }));

  const total = ESTATE_TASKS.length;
  const completed = Object.values(done).filter(Boolean).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Estate Planning · Get-Ready Checklist</span>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · mostly do-it-yourself · changes nothing in your file
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          Getting ready — the part that&apos;s mostly on you
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 14px" }}>
          Most of estate planning isn&apos;t legal work — it&apos;s naming beneficiaries, being willing
          to move and retitle money, and getting your passwords and instructions organized so the
          people you trust can actually find everything. A perfect will is useless if your family
          can&apos;t log in or doesn&apos;t know where to look. <strong>{selfServiceCount()} of these{" "}
          {total} steps are yours to do</strong> — no lawyer required.
        </p>

        {/* Progress */}
        <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: navy }}>Your progress</span>
            <span style={{ fontSize: 13, color: textLt }}>{completed} of {total} done</span>
          </div>
          <div style={{ height: 8, background: "#e7e2d8", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: gold, transition: "width .25s" }} />
          </div>
        </div>

        {groups.map(({ category, tasks }) => {
          const isWhatIf = category.key === "whatif";
          return (
            <section key={category.key} style={{ marginTop: 26 }}>
              <h2 style={{ fontFamily: serif, fontSize: 21, margin: "0 0 2px", color: navy }}>{category.label}</h2>
              <p style={{ fontSize: 13, color: textLt, margin: "0 0 12px" }}>{category.blurb}</p>

              <div style={{ display: "grid", gap: 10 }}>
                {tasks.map((t) => {
                  const ds = DOER_STYLE[t.doer];
                  const checked = !!done[t.key];
                  return (
                    <div
                      key={t.key}
                      style={{
                        background: isWhatIf ? "rgba(200,169,110,0.08)" : "var(--brand-white)",
                        border: `1px solid ${isWhatIf ? gold : border}`,
                        borderRadius: 12,
                        padding: 16,
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                        opacity: checked ? 0.62 : 1,
                        transition: "opacity .15s",
                      }}
                    >
                      <button
                        onClick={() => toggle(t.key)}
                        aria-pressed={checked}
                        aria-label={checked ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
                        style={{
                          flexShrink: 0,
                          width: 22,
                          height: 22,
                          marginTop: 1,
                          borderRadius: 6,
                          border: `1.5px solid ${checked ? "#2d7a4f" : border}`,
                          background: checked ? "#2d7a4f" : "var(--brand-white)",
                          color: "#fff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {checked && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 14.5, fontWeight: 600, color: navy, textDecoration: checked ? "line-through" : "none" }}>{t.title}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: ds.color, background: ds.bg, padding: "2px 7px", borderRadius: 999 }}>
                            {ds.label}
                          </span>
                        </div>
                        <p style={{ fontSize: 13, color: textMd, lineHeight: 1.55, margin: 0 }}>{t.detail}</p>

                        {isWhatIf && (
                          <Link href={whatIfHref} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, background: gold, color: "#1a1008", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                            Play the What-If game →
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Turn prep into a real plan */}
        <div style={{ marginTop: 30, background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: "20px 22px" }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, fontFamily: serif }}>Turn this into your documents</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: "0 0 14px", color: "var(--brand-cream-text)" }}>
            When you&apos;re ready, start a privileged conversation. We&apos;ll fold your what-ifs and the
            choices above into a real strategy and draft the documents you need — reviewed by an
            attorney before you sign.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={chatHref} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: gold, color: "#1a1008", padding: "9px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}>
              Start my estate plan →
            </Link>
            <Link href={caseFileId ? `/estate/planner?caseFileId=${caseFileId}` : "/estate/planner"} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: "var(--brand-cream-heading)", border: `1px solid rgba(255,255,255,0.3)`, padding: "9px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}>
              Do I need a trust?
            </Link>
          </div>
        </div>

        <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "18px 2px 0" }}>{estateChecklistDisclaimer()}</p>
      </main>
    </div>
  );
}

export default function EstateChecklistPage() {
  return (
    <Suspense fallback={null}>
      <ChecklistTool />
    </Suspense>
  );
}
