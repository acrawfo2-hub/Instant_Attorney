import React from "react";
import type { EmploymentRoadmap as EmploymentRoadmapData, EmploymentStage } from "@/lib/employment-roadmap";

// ─────────────────────────────────────────────────────────────────────────────
// Employment Roadmap — the staged path of a discrimination/retaliation claim with
// a best-effort "you are here." Presentational only; staging is computed by the
// pure lib/employment-roadmap.ts. Mirrors the family/bankruptcy roadmaps.
// ─────────────────────────────────────────────────────────────────────────────

function StageDot({ status, number }: { status: EmploymentStage["status"]; number: number }) {
  return (
    <span className={`lf-step-dot lf-step-dot-${status === "current" ? "current" : status === "done" ? "done" : "upcoming"}`}>
      {status === "done" ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        number
      )}
    </span>
  );
}

export default function EmploymentRoadmap({ roadmap }: { roadmap: EmploymentRoadmapData }) {
  const navy = "var(--brand-navy)";
  const gold = "var(--brand-gold)";
  const textMd = "var(--brand-text-md)";
  const textLt = "var(--brand-text-lt)";
  const border = "var(--brand-border)";

  return (
    <div className="lf-card lf-card-full" style={{ borderLeft: `3px solid ${gold}` }}>
      <div className="lf-card-label">The Path of an Employment Claim</div>
      <p className="lf-wizard-hint" style={{ marginBottom: 16 }}>
        Here&apos;s the whole process and where you are. The steps are deadline-gated, so the order matters — use
        it as a map, and watch the clock.
      </p>

      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {roadmap.stages.map((stage, i) => {
          const isCurrent = stage.status === "current";
          return (
            <li
              key={stage.key}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 12px",
                borderRadius: 8,
                background: isCurrent ? "rgba(200,169,110,0.12)" : "transparent",
                border: isCurrent ? `1px solid ${gold}` : "1px solid transparent",
                marginBottom: 4,
                opacity: stage.status === "upcoming" ? 0.78 : 1,
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <StageDot status={stage.status} number={i + 1} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: navy }}>{stage.title}</span>
                  {isCurrent && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: navy, background: "var(--brand-gold-lt, rgba(200,169,110,0.3))", padding: "2px 7px", borderRadius: 4 }}>
                      You are here
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: textMd, margin: "4px 0 0" }}>{stage.body}</p>
                {stage.tip && (
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: textLt, margin: "6px 0 0", fontStyle: "italic" }}>
                    💡 {stage.tip}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p style={{ fontSize: 12, lineHeight: 1.5, color: textLt, margin: "14px 2px 0", borderTop: `1px solid ${border}`, paddingTop: 12 }}>
        {roadmap.disclaimer}
      </p>
    </div>
  );
}
