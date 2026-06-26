"use client";

import React, { useState } from "react";
import type { ResolvedRoadmap, RoadmapAiOverlay } from "@/lib/roadmap-types";
import RoadmapPanel from "@/components/RoadmapPanel";
import RoadmapConsultNudge from "@/components/RoadmapConsultNudge";
import RoadmapRefresh from "@/components/RoadmapRefresh";

export default function RoadmapSpine({
  resolved,
  initialOverlay,
  fingerprint,
  caseFileId,
  hasConsult,
  refreshEnabled = true,
}: {
  resolved: ResolvedRoadmap;
  initialOverlay: RoadmapAiOverlay;
  fingerprint: string;
  caseFileId: string;
  hasConsult: boolean;
  refreshEnabled?: boolean;
}) {
  const [overlay, setOverlay] = useState<RoadmapAiOverlay>(initialOverlay);

  return (
    <>
      <RoadmapRefresh
        caseFileId={caseFileId}
        fingerprint={fingerprint}
        enabled={refreshEnabled}
        onRefreshed={setOverlay}
      />
      <RoadmapConsultNudge overlay={overlay} hasConsult={hasConsult} />
      <RoadmapPanel
        label={resolved.label}
        pathLabel={resolved.pathLabel}
        stages={resolved.stages}
        disclaimer={resolved.disclaimer}
        overlay={overlay}
        safety={resolved.safety}
        safetyNote={resolved.safetyNote}
        urgent={resolved.urgent}
        urgentNote={resolved.urgentNote}
      />
    </>
  );
}
