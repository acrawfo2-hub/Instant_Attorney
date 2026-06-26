"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  assessEmploymentClaim,
  type ClaimInput,
  type Urgency,
} from "@/lib/employment-claim-assessment";
import { getEmploymentInstrument } from "@/lib/employment-instruments";

// Pure client tool over lib/employment-claim-assessment.ts (no AI, no API).
// Identifies possible claims, the forum, and — above all — the deadline.

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

const URGENCY_STYLE: Record<Urgency, { color: string; label: string }> = {
  ok: { color: "#2d7a4f", label: "On time" },
  soon: { color: "#b4341f", label: "Deadline soon" },
  likely_passed: { color: "#b4341f", label: "May have passed" },
  unknown: { color: "#8a6d2f", label: "Check the date" },
};

function fieldStyle() {
  return { boxSizing: "border-box" as const, padding: "9px 10px", fontSize: 14, border: `1px solid ${border}`, borderRadius: 7, fontFamily: "inherit", color: textDk, background: "var(--brand-white)", width: "100%" };
}

function ClaimCheck() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");
  const [input, setInput] = useState<ClaimInput>({});
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<ClaimInput>) => setInput((p) => ({ ...p, ...patch }));
  const a = submitted ? assessEmploymentClaim(input) : null;

  const wizardHref = (wizardType: string) => (caseFileId ? `/wizard/${wizardType}?caseFileId=${caseFileId}` : "/free-chat?area=employment");

  const yesNo = (label: string, value: boolean | undefined, onChange: (v: boolean | undefined) => void) =>
    row(label,
      <select style={fieldStyle()} value={value === undefined ? "" : value ? "yes" : "no"} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "yes")}>
        <option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option>
      </select>
    );

  function row(label: string, control: React.ReactNode) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${border}` }}>
        <span style={{ fontSize: 14, color: textMd }}>{label}</span>
        {control}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield /><span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Employment Claim Check</span>
      </header>

      <main style={{ maxWidth: 740, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · what claim, what forum, and — most important — your deadline
        </div>
        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>What happened at work?</h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 8px" }}>
          Employment deadlines are short and unforgiving. Answer what you can and we&apos;ll flag the possible
          claims, where each is filed, and how much time you may have left.
        </p>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: textLt, margin: "0 0 22px" }}>
          Texas is at-will, so not every unfair firing is unlawful — this helps you spot the ones that may be.
        </p>

        <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: "6px 18px 16px" }}>
          {row("What happened?",
            <select style={fieldStyle()} value={input.adverseAction ?? ""} onChange={(e) => set({ adverseAction: (e.target.value || undefined) as ClaimInput["adverseAction"] })}>
              <option value="">Not sure</option>
              <option value="fired">Fired / let go</option>
              <option value="demoted">Demoted</option>
              <option value="pay_cut">Pay cut</option>
              <option value="not_hired">Not hired</option>
              <option value="harassment">Harassment / hostile environment</option>
              <option value="denied_leave">Denied leave</option>
              <option value="denied_accommodation">Denied an accommodation</option>
              <option value="unpaid">Not paid what I'm owed</option>
              <option value="other">Something else</option>
            </select>
          )}
          {row("Do you think it was because of a protected trait?",
            <select style={fieldStyle()} value={input.protectedClass ?? ""} onChange={(e) => set({ protectedClass: (e.target.value || undefined) as ClaimInput["protectedClass"] })}>
              <option value="">Not sure</option>
              <option value="race">Race / color</option>
              <option value="sex">Sex / gender</option>
              <option value="pregnancy">Pregnancy</option>
              <option value="religion">Religion</option>
              <option value="national_origin">National origin</option>
              <option value="age_40_plus">Age (40+)</option>
              <option value="disability">Disability</option>
              <option value="none">No — none of these</option>
            </select>
          )}
          {yesNo("Were you punished after you complained or asserted a right?", input.retaliation, (v) => set({ retaliation: v }))}
          {yesNo("Were you fired for refusing to do something illegal?", input.refusedIllegalAct, (v) => set({ refusedIllegalAct: v }))}
          {yesNo("Is this tied to a workers' comp claim?", input.workersComp, (v) => set({ workersComp: v }))}
          {yesNo("Are you owed unpaid wages or overtime?", input.wageIssue, (v) => set({ wageIssue: v }))}
          {yesNo("Was this about medical/family leave?", input.leaveIssue, (v) => set({ leaveIssue: v }))}
          {yesNo("Punished for discussing pay or organizing with coworkers?", input.concertedActivity, (v) => set({ concertedActivity: v }))}
          {row("How big is the employer?",
            <select style={fieldStyle()} value={input.employerSize ?? ""} onChange={(e) => set({ employerSize: (e.target.value || undefined) as ClaimInput["employerSize"] })}>
              <option value="">Not sure</option>
              <option value="1-14">1–14</option><option value="15-19">15–19</option><option value="20-49">20–49</option><option value="50-99">50–99</option><option value="100-plus">100+</option>
            </select>
          )}
          {row("How many months ago did it happen?",
            <input type="number" inputMode="numeric" style={fieldStyle()} placeholder="e.g. 3" value={input.monthsSinceAction ?? ""} onChange={(e) => set({ monthsSinceAction: e.target.value === "" ? undefined : Number(e.target.value) })} />
          )}
          <button onClick={() => setSubmitted(true)} style={{ marginTop: 16, padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: "pointer" }}>
            Check my claims →
          </button>
        </div>

        {a && (
          <section style={{ marginTop: 24 }}>
            {a.claims.length === 0 ? (
              <div style={{ background: "rgba(120,120,120,0.1)", border: `1px solid ${border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: navy, margin: "0 0 8px" }}>No clear statutory claim on these facts.</p>
                <p style={{ fontSize: 13.5, color: textMd, lineHeight: 1.55, margin: 0 }}>{a.atWillNote}</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
                {a.claims.map((c) => {
                  const u = URGENCY_STYLE[c.urgency];
                  return (
                    <div key={c.key} style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontSize: 15.5, fontWeight: 600, color: navy, fontFamily: serif }}>{c.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: u.color, background: u.color === "#2d7a4f" ? "rgba(45,122,79,0.12)" : "rgba(180,52,31,0.1)", padding: "2px 8px", borderRadius: 999 }}>
                          {u.label}{c.daysRemaining != null ? ` · ~${Math.max(0, c.daysRemaining)}d left` : ""}
                        </span>
                      </div>
                      <p style={{ fontSize: 13.5, color: textMd, lineHeight: 1.5, margin: "0 0 6px" }}>{c.basis}</p>
                      <p style={{ fontSize: 13, color: navy, margin: "0 0 4px" }}><strong>Where:</strong> {c.forum}</p>
                      <p style={{ fontSize: 13, color: c.urgency === "ok" ? textMd : "#b4341f", margin: 0 }}><strong>Deadline:</strong> {c.deadlineText}</p>
                      {c.coverageNote && <p style={{ fontSize: 12.5, color: textLt, margin: "6px 0 0" }}>{c.coverageNote}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
              {a.warnings.length > 0 && (
                <>
                  <h3 style={sectionLabel}>Watch out</h3>
                  <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>
                    {a.warnings.map((w, i) => (
                      <li key={i} style={{ fontSize: 13.5, lineHeight: 1.55, color: w.severe ? "#b4341f" : textMd, fontWeight: w.severe ? 600 : 400, marginBottom: 6 }}>{w.text}</li>
                    ))}
                  </ul>
                </>
              )}
              <h3 style={sectionLabel}>What to do</h3>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {a.actions.map((x, i) => (
                  <li key={i} style={{ fontSize: 13.5, lineHeight: 1.55, color: textMd, marginBottom: 7 }}>
                    {x.urgent && <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#b4341f", background: "rgba(180,52,31,0.1)", padding: "2px 6px", borderRadius: 4, marginRight: 6 }}>Now</span>}
                    <span style={{ fontWeight: 500 }}>{x.step}</span>{x.why && <span style={{ color: textLt }}> — {x.why}</span>}
                  </li>
                ))}
              </ol>
              {a.relevant_instruments.length > 0 && (
                <>
                  <h3 style={sectionLabel}>Documents that help</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {a.relevant_instruments.map((key) => {
                      const inst = getEmploymentInstrument(key);
                      if (!inst) return null;
                      return <Link key={key} href={wizardHref(inst.wizard_type)} style={{ fontSize: 13.5, fontWeight: 500, color: navy, background: gold, padding: "9px 14px", borderRadius: 8, textDecoration: "none" }}>{inst.label} →</Link>;
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

const sectionLabel = { fontSize: 12.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "var(--brand-text-md)", margin: "16px 0 8px" };

export default function ClaimCheckPage() {
  return (
    <Suspense fallback={null}>
      <ClaimCheck />
    </Suspense>
  );
}
