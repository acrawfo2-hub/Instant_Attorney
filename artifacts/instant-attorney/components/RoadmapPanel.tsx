"use client";

import React, { useState } from "react";
import type { RoadmapAiOverlay, RoadmapStage } from "@/lib/roadmap-types";
import type { RoadmapAssertion } from "@/lib/roadmap-assertions";

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

export interface RoadmapPanelProps {
  label: string;
  pathLabel?: string;
  stages: RoadmapStage[];
  disclaimer: string;
  overlay?: RoadmapAiOverlay;
  safety?: boolean;
  safetyNote?: string;
  urgent?: boolean;
  urgentNote?: string;
  correctionsEnabled?: boolean;
  caseFileId?: string;
  onAssert?: (stageKey: string, assertion: RoadmapAssertion, note?: string) => Promise<void>;
}

export default function RoadmapPanel({
  label,
  pathLabel,
  stages,
  disclaimer,
  overlay,
  safety,
  safetyNote,
  urgent,
  urgentNote,
  correctionsEnabled = false,
  caseFileId,
  onAssert,
}: RoadmapPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [disputeStage, setDisputeStage] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const navy = "var(--brand-navy)";
  const gold = "var(--brand-gold)";
  const textMd = "var(--brand-text-md)";
  const textLt = "var(--brand-text-lt)";
  const border = "var(--brand-border)";

  const title = pathLabel ? `${label} — ${pathLabel}` : label;
  const emphasize = new Set(overlay?.emphasize_stages ?? []);
  const canCorrect = correctionsEnabled && Boolean(caseFileId) && Boolean(onAssert);

  function isStageOpen(stage: RoadmapStage): boolean {
    if (showAll) return true;
    if (stage.status === "current") return true;
    if (emphasize.has(stage.key)) return true;
    return Boolean(expanded[stage.key]);
  }

  async function handleAssert(stageKey: string, assertion: RoadmapAssertion, note?: string) {
    if (!onAssert || busyStage) return;
    setBusyStage(stageKey);
    try {
      await onAssert(stageKey, assertion, note);
      setDisputeStage(null);
      setDisputeNote("");
      setToast("Map updated — your correction is saved.");
      window.setTimeout(() => setToast(null), 4000);
    } catch {
      setToast("Could not save your correction. Please try again.");
      window.setTimeout(() => setToast(null), 4000);
    } finally {
      setBusyStage(null);
    }
  }

  return (
    <div className="lf-card lf-card-full lf-roadmap-spine" style={{ borderLeft: `3px solid ${gold}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div className="lf-card-label">{title}</div>
        <button
          type="button"
          className="lf-roadmap-show-all"
          onClick={() => setShowAll((v) => !v)}
          aria-pressed={showAll}
        >
          {showAll ? "Guided view" : "Show everything"}
        </button>
      </div>
      <p className="lf-wizard-hint" style={{ marginBottom: 16 }}>
        Here&apos;s the whole path and where you are right now. Steps can overlap or repeat — use it as a map,
        not a deadline.
      </p>

      {toast && (
        <p className="lf-roadmap-toast" role="status">
          {toast}
        </p>
      )}

      {safety && safetyNote && (
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
          <span style={{ fontSize: 13.5, lineHeight: 1.55, color: "#7a2417" }}>{safetyNote}</span>
        </div>
      )}

      {urgent && urgentNote && (
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
          <span style={{ fontSize: 13.5, lineHeight: 1.55, color: "#7a2417" }}>{urgentNote}</span>
        </div>
      )}

      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {stages.map((stage, i) => {
          const isCurrent = stage.status === "current";
          const open = isStageOpen(stage);
          const aiNote = overlay?.stage_notes?.[stage.key];
          const collapsed = !open && stage.status !== "current";
          const isBusy = busyStage === stage.key;
          const showDisputeForm = disputeStage === stage.key;

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
                opacity: stage.status === "upcoming" && collapsed ? 0.72 : 1,
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <StageDot status={stage.status} number={i + 1} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: navy }}>{stage.title}</span>
                  {isCurrent && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: navy, background: "var(--brand-gold-lt, rgba(200,169,110,0.3))", padding: "2px 7px", borderRadius: 4 }}>
                      You are here
                    </span>
                  )}
                  {collapsed && (
                    <button
                      type="button"
                      className="lf-roadmap-stage-toggle"
                      onClick={() => setExpanded((e) => ({ ...e, [stage.key]: true }))}
                    >
                      Show options
                    </button>
                  )}
                </div>
                {open && (
                  <>
                    <p style={{ fontSize: 13.5, lineHeight: 1.55, color: textMd, margin: "4px 0 0" }}>{stage.body}</p>
                    {stage.tip && (
                      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: textLt, margin: "6px 0 0", fontStyle: "italic" }}>
                        💡 {stage.tip}
                      </p>
                    )}
                    {aiNote && (
                      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: textMd, margin: "8px 0 0", padding: "8px 10px", background: "rgba(26,43,74,0.05)", borderRadius: 6 }}>
                        {aiNote}
                      </p>
                    )}
                    {canCorrect && (
                      <div className="lf-roadmap-corrections">
                        {(stage.status === "current" || stage.status === "upcoming") && (
                          <button
                            type="button"
                            className="lf-roadmap-correct-btn"
                            disabled={isBusy}
                            onClick={() => handleAssert(stage.key, "completed")}
                          >
                            {isBusy ? "Saving…" : "I've already done this"}
                          </button>
                        )}
                        {(stage.status === "current" || stage.status === "done") && !showDisputeForm && (
                          <button
                            type="button"
                            className="lf-roadmap-correct-btn lf-roadmap-correct-btn-muted"
                            disabled={isBusy}
                            onClick={() => {
                              setDisputeStage(stage.key);
                              setDisputeNote("");
                            }}
                          >
                            This isn&apos;t right
                          </button>
                        )}
                        {showDisputeForm && (
                          <div className="lf-roadmap-dispute-form">
                            <label className="lf-roadmap-dispute-label" htmlFor={`roadmap-dispute-${stage.key}`}>
                              What&apos;s off? (optional)
                            </label>
                            <textarea
                              id={`roadmap-dispute-${stage.key}`}
                              className="lf-roadmap-dispute-input"
                              rows={2}
                              value={disputeNote}
                              onChange={(e) => setDisputeNote(e.target.value)}
                              placeholder="e.g. We haven't filed yet — still gathering documents"
                            />
                            <div className="lf-roadmap-dispute-actions">
                              <button
                                type="button"
                                className="lf-roadmap-correct-btn"
                                disabled={isBusy}
                                onClick={() =>
                                  handleAssert(
                                    stage.key,
                                    stage.status === "done" ? "not_yet" : "dispute",
                                    disputeNote || undefined,
                                  )
                                }
                              >
                                {isBusy ? "Saving…" : "Update map"}
                              </button>
                              <button
                                type="button"
                                className="lf-roadmap-correct-btn lf-roadmap-correct-btn-muted"
                                disabled={isBusy}
                                onClick={() => {
                                  setDisputeStage(null);
                                  setDisputeNote("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p style={{ fontSize: 12, lineHeight: 1.5, color: textLt, margin: "14px 2px 0", borderTop: `1px solid ${border}`, paddingTop: 12 }}>
        {disclaimer}
      </p>
    </div>
  );
}
