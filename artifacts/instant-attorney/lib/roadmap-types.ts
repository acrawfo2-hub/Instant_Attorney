// Shared roadmap types for deterministic builders, AI overlay, and UI.

export type StageStatus = "done" | "current" | "upcoming";

export interface RoadmapStage {
  key: string;
  title: string;
  body: string;
  status: StageStatus;
  tip?: string;
}

/** Tier-3 AI overlay — nudges and notes only; never redefines stage completion. */
export interface RoadmapAiOverlay {
  stage_notes?: Record<string, string>;
  emphasize_stages?: string[];
  consult_recommended?: boolean;
  consult_reason?: string;
  consult_urgency?: "low" | "medium" | "high";
}

export interface RoadmapSnapshotRow {
  id: string;
  case_file_id: string;
  user_id: string;
  file_fingerprint: string;
  blueprint_key: string;
  blueprint_version: string;
  ai_overlay: RoadmapAiOverlay;
  generated_at: string;
  updated_at: string;
}

export interface ResolvedRoadmap {
  blueprintKey: string;
  blueprintVersion: string;
  label: string;
  pathLabel?: string;
  safety?: boolean;
  safetyNote?: string;
  urgent?: boolean;
  urgentNote?: string;
  stages: RoadmapStage[];
  disclaimer: string;
  currentStageKey: string | null;
}

export const ROADMAP_BLUEPRINT_VERSION = "1";
export const ROADMAP_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
