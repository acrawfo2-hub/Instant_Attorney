import React from "react";
import type { PiRoadmap as PiRoadmapData, RoadmapStage } from "@/lib/pi-roadmap";

function StageDot({ status, number }: { status: RoadmapStage["status"]; number: number }) {
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

export default function PiRoadmap({ roadmap }: { roadmap: PiRoadmapData }) {
  const gold = "var(--brand-gold)";
  const textLt = "var(--brand-text-lt)";

  return (
    <div className="lf-card lf-card-full" style={{ borderLeft: `3px solid ${gold}` }}>
      <div className="lf-card-label">Your Roadmap — {roadmap.pathLabel}</div>
      <p className="lf-wizard-hint" style={{ marginBottom: 16 }}>
        Here&apos;s the typical path for a Texas injury claim and where you are now. Evidence fades and deadlines
        run — use this as a map, not a guarantee.
      </p>

      {roadmap.urgent && roadmap.urgentNote && (
        <div
          role="note"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            background: "rgba(180,52,31,0.08)",
            border: "1px solid rgba(180,52,31,0.35)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 16,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b4341f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <span style={{ fontSize: 13.5, lineHeight: 1.55, color: "#7a2417" }}>{roadmap.urgentNote}</span>
        </div>
      )}

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
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--brand-navy)", marginBottom: 4 }}>
                  {stage.title}
                  {isCurrent && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: gold, marginLeft: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      You are here
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: textLt }}>{stage.body}</p>
                {stage.tip && (
                  <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5, color: gold, fontStyle: "italic" }}>
                    Tip: {stage.tip}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p style={{ fontSize: 12, color: textLt, lineHeight: 1.55, margin: "14px 0 0", borderTop: "1px solid var(--brand-border)", paddingTop: 12 }}>
        {roadmap.disclaimer}
      </p>
    </div>
  );
}
