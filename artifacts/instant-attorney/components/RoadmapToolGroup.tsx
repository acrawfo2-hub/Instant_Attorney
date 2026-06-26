"use client";

import React from "react";
import { toolStageForSection } from "@/lib/roadmap-build";

export default function RoadmapToolGroup({
  sectionId,
  blueprintKey,
  currentStageKey,
  hasConsult,
}: {
  sectionId: string;
  blueprintKey: string;
  currentStageKey: string | null;
  children: React.ReactNode;
}) {
  const mappedStage = toolStageForSection(sectionId, blueprintKey);

  const visible = !mappedStage || !currentStageKey || mappedStage === currentStageKey;

  if (visible) return <>{children}</>;

  return (
    <details className="lf-roadmap-tool-collapsed">
      <summary className="lf-roadmap-tool-collapsed-summary">
        Related tools (another stage)
        <span className="lf-roadmap-tool-collapsed-hint"> — expand if you want to explore ahead</span>
      </summary>
      <div className="lf-roadmap-tool-collapsed-body">{children}</div>
    </details>
  );
}
