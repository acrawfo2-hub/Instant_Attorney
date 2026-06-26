"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResolvedRoadmap, RoadmapAiOverlay } from "@/lib/roadmap-types";
import type { RoadmapAssertion } from "@/lib/roadmap-assertions";
import RoadmapPanel from "@/components/RoadmapPanel";
import RoadmapConsultNudge from "@/components/RoadmapConsultNudge";
import RoadmapRefresh from "@/components/RoadmapRefresh";

export default function RoadmapSpine({
  resolved,
  initialOverlay,
  fingerprint,
  caseFileId,
  hasConsult,
  consultHref = "/consult/schedule",
  refreshEnabled = true,
  correctionsEnabled = true,
}: {
  resolved: ResolvedRoadmap;
  initialOverlay: RoadmapAiOverlay;
  fingerprint: string;
  caseFileId: string;
  hasConsult: boolean;
  consultHref?: string;
  refreshEnabled?: boolean;
  correctionsEnabled?: boolean;
}) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<RoadmapAiOverlay>(initialOverlay);

  const handleAssert = useCallback(
    async (stageKey: string, assertion: RoadmapAssertion, note?: string) => {
      const res = await fetch("/api/roadmap/assert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFileId, stageKey, assertion, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "assert failed");
      }

      router.refresh();

      fetch("/api/roadmap/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFileId, force: true }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.overlay) setOverlay(data.overlay);
        })
        .catch(() => {
          /* non-blocking */
        });
    },
    [caseFileId, router],
  );

  return (
    <>
      <RoadmapRefresh
        caseFileId={caseFileId}
        fingerprint={fingerprint}
        enabled={refreshEnabled}
        onRefreshed={setOverlay}
      />
      <RoadmapConsultNudge overlay={overlay} hasConsult={hasConsult} consultHref={consultHref} />
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
        correctionsEnabled={correctionsEnabled}
        caseFileId={caseFileId}
        onAssert={handleAssert}
        consultHref={consultHref}
      />
    </>
  );
}
