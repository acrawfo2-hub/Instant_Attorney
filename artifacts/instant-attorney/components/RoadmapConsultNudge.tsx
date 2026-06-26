"use client";

import React from "react";
import Link from "next/link";
import type { RoadmapAiOverlay } from "@/lib/roadmap-types";

export default function RoadmapConsultNudge({
  overlay,
  hasConsult,
  consultHref = "/consult/schedule",
}: {
  overlay: RoadmapAiOverlay;
  hasConsult: boolean;
  consultHref?: string;
}) {
  if (!overlay.consult_recommended || hasConsult) return null;

  const urgent = overlay.consult_urgency === "high";
  const medium = overlay.consult_urgency === "medium";

  return (
    <div
      className="lf-card lf-card-full"
      style={{
        borderLeft: `3px solid ${urgent ? "#b4341f" : "var(--brand-gold)"}`,
        background: urgent ? "rgba(180,52,31,0.06)" : "rgba(200,169,110,0.08)",
        marginBottom: 12,
      }}
    >
      <div className="lf-card-label">
        {urgent ? "Consult recommended — time-sensitive" : medium ? "A consult may help here" : "Consider a consult"}
      </div>
      <p className="lf-wizard-hint" style={{ marginBottom: 12 }}>
        {overlay.consult_reason ||
          "An attorney can map your specific facts to deadlines and next steps — general information online cannot replace that."}
      </p>
      <Link href={consultHref} className="lf-inst-start-btn">
        Schedule a consult with Andrew Crawford, Esq. →
      </Link>
    </div>
  );
}
