"use client";

import React, { useEffect, useRef } from "react";
import type { RoadmapAiOverlay } from "@/lib/roadmap-types";

interface RoadmapRefreshProps {
  caseFileId: string;
  fingerprint: string;
  enabled?: boolean;
  onRefreshed?: (overlay: RoadmapAiOverlay) => void;
}

/**
 * Fires a background roadmap refresh when the file page loads. Skips if the
 * server already served a fresh snapshot (handled by the API fingerprint check).
 */
export default function RoadmapRefresh({
  caseFileId,
  fingerprint,
  enabled = true,
  onRefreshed,
}: RoadmapRefreshProps) {
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current || !caseFileId) return;
    ran.current = true;

    const key = `roadmap-refresh:${caseFileId}:${fingerprint}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;

    fetch("/api/roadmap/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseFileId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.overlay && onRefreshed) onRefreshed(data.overlay);
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1");
      })
      .catch(() => {
        /* non-blocking */
      });
  }, [caseFileId, fingerprint, enabled, onRefreshed]);

  return null;
}
