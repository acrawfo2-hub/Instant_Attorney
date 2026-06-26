"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Texas Standard Possession Order schedule generator — a standalone, free tool.
//
// Calls /api/family/possession-schedule (pure compute, no AI, no token spend).
// When opened from a file (?caseFileId=), the schedule is saved as a confirmed
// fact, so a parenting plan / decree seeds from it. It never changes which
// wizards are recommended.
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

interface Period {
  kind: "weekend" | "thursday";
  start: string;
  end: string;
  label: string;
}
interface Schedule {
  periods: Period[];
  distance: "within_100" | "over_100";
  expanded: boolean;
  summerNote: string;
  holidayRules: string[];
  assumptions: string[];
  disclaimer: string;
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function PossessionTool() {
  const params = useSearchParams();
  const caseFileId = params.get("caseFileId");

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const inThreeMonths = new Date(today.getTime() + 92 * 86400000);

  const [startDate, setStartDate] = useState(iso(today));
  const [endDate, setEndDate] = useState(iso(inThreeMonths));
  const [distance, setDistance] = useState<"within_100" | "over_100">("within_100");
  const [expanded, setExpanded] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch("/api/family/possession-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, distance, expanded, caseFileId: caseFileId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok && !data.schedule) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSchedule(data.schedule as Schedule);
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

  return (
    <div style={{ minHeight: "100vh", background: cream, color: textDk, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: navy, color: "var(--brand-cream-heading)" }}>
        <Link href={caseFileId ? `/dashboard/${caseFileId}` : "/dashboard"} style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
          <Shield />
          <span style={{ fontWeight: 500 }}>Instant-Attorney</span>
        </Link>
        <span style={{ fontSize: 13, letterSpacing: 0.5, color: gold }}>Possession Schedule</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.14)", color: textMd, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, marginBottom: 20 }}>
          <Shield size={14} color={gold} /> Free · the Texas Standard Possession Order, on a calendar
        </div>

        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, margin: "0 0 14px" }}>
          When do I have my kids?
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: textMd, margin: "0 0 8px" }}>
          Texas presumes the Standard Possession Order for a child 3 or older. Pick a date range and
          we&apos;ll lay out the weekend and Thursday periods, plus the holiday and summer rules.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: textLt, margin: "0 0 24px" }}>
          {caseFileId
            ? "We'll save the schedule to your file so a parenting plan or decree can use it."
            : "Open this from one of your files and we'll save it so your documents can use it."}
        </p>

        <div style={{ display: "grid", gap: 16, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...field, width: "100%" }} />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ ...field, width: "100%" }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>How far apart do the parents live?</label>
            <select value={distance} onChange={(e) => setDistance(e.target.value as "within_100" | "over_100")} style={{ ...field, width: "100%" }}>
              <option value="within_100">Within 100 miles</option>
              <option value="over_100">More than 100 miles apart</option>
            </select>
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: textMd, cursor: "pointer" }}>
            <input type="checkbox" checked={expanded} onChange={(e) => setExpanded(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              Expanded schedule (pickup at school Friday, return Monday; Thursday to Friday) — a common
              election that lengthens each period.
            </span>
          </label>

          {error && <p style={{ color: "#b4341f", fontSize: 14, margin: 0 }}>{error}</p>}

          <button
            onClick={generate}
            disabled={loading}
            style={{ padding: "13px 22px", fontSize: 15, fontWeight: 500, color: navy, background: gold, border: "none", borderRadius: 8, cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1 }}
          >
            {loading ? "Building…" : "Show the schedule →"}
          </button>
        </div>

        {schedule && (
          <section style={{ marginTop: 28 }}>
            <div style={{ background: navy, color: "var(--brand-cream-heading)", borderRadius: 12, padding: 24 }}>
              <p style={{ fontSize: 13, letterSpacing: 0.5, color: gold, margin: "0 0 12px" }}>
                {schedule.expanded ? "EXPANDED" : "STANDARD"} POSSESSION ·{" "}
                {schedule.distance === "within_100" ? "WITHIN 100 MILES" : "OVER 100 MILES"}
              </p>

              {schedule.periods.length === 0 ? (
                <p style={{ fontSize: 14.5, color: "rgba(255,255,255,0.82)", margin: 0 }}>
                  No regular weekend/Thursday periods fall in this range.
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {schedule.periods.map((p, i) => (
                    <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: i < schedule.periods.length - 1 ? "1px solid rgba(255,255,255,0.12)" : "none", fontSize: 14.5 }}>
                      <span style={{ color: gold, minWidth: 96 }}>{p.label}</span>
                      <span style={{ color: "rgba(255,255,255,0.9)", textAlign: "right" }}>
                        {p.kind === "weekend" || p.start !== p.end ? `${fmtDate(p.start)} → ${fmtDate(p.end)}` : fmtDate(p.start)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ marginTop: 16, background: "var(--brand-white)", border: `1px solid ${border}`, borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: textDk, margin: "0 0 8px" }}>Summer</p>
              <p style={{ fontSize: 14, color: textMd, lineHeight: 1.55, margin: "0 0 16px" }}>{schedule.summerNote}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: textDk, margin: "0 0 8px" }}>Holidays (standard SPO rules)</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: textMd, lineHeight: 1.6 }}>
                {schedule.holidayRules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {schedule.assumptions.length > 0 && (
                <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 12.5, color: textLt, lineHeight: 1.55 }}>
                  {schedule.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
              {caseFileId && (
                <p style={{ fontSize: 13, color: saved ? "var(--brand-navy)" : textLt, fontWeight: saved ? 600 : 400, margin: "12px 0 0" }}>
                  {saved ? "✓ Saved to your file — your documents can use this." : "Not saved to your file."}
                </p>
              )}
              <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "12px 0 0" }}>{schedule.disclaimer}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function PossessionSchedulePage() {
  return (
    <Suspense fallback={null}>
      <PossessionTool />
    </Suspense>
  );
}
