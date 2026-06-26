import type { RoadmapAiOverlay, RoadmapSnapshotRow } from "./roadmap-types";
import { ROADMAP_SNAPSHOT_MAX_AGE_MS } from "./roadmap-types";

export function parseRoadmapOverlay(raw: unknown): RoadmapAiOverlay {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const overlay: RoadmapAiOverlay = {};

  if (o.stage_notes && typeof o.stage_notes === "object" && !Array.isArray(o.stage_notes)) {
    const notes: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.stage_notes as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) notes[k] = v.trim();
    }
    if (Object.keys(notes).length) overlay.stage_notes = notes;
  }

  if (Array.isArray(o.emphasize_stages)) {
    overlay.emphasize_stages = o.emphasize_stages.filter((s): s is string => typeof s === "string");
  }

  if (typeof o.consult_recommended === "boolean") overlay.consult_recommended = o.consult_recommended;
  if (typeof o.consult_reason === "string" && o.consult_reason.trim()) {
    overlay.consult_reason = o.consult_reason.trim();
  }
  if (o.consult_urgency === "low" || o.consult_urgency === "medium" || o.consult_urgency === "high") {
    overlay.consult_urgency = o.consult_urgency;
  }

  return overlay;
}

export function snapshotIsFresh(
  row: RoadmapSnapshotRow | null,
  fingerprint: string,
  blueprintKey: string,
): boolean {
  if (!row) return false;
  if (row.file_fingerprint !== fingerprint) return false;
  if (row.blueprint_key !== blueprintKey) return false;
  const age = Date.now() - new Date(row.generated_at).getTime();
  return age >= 0 && age < ROADMAP_SNAPSHOT_MAX_AGE_MS;
}
