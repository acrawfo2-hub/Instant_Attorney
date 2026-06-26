import type { ResolvedRoadmap, RoadmapAiOverlay } from "./roadmap-types";

const OVERLAY_JSON_BLOCK = /---ROADMAP OVERLAY---\s*([\s\S]*?)\s*---END ROADMAP OVERLAY---/;

export const ROADMAP_REFRESH_SYSTEM_PROMPT = `You are the Instant Attorney roadmap assistant for Crawford Law PLLC (Texas). You help orient a client within their legal matter by suggesting optional notes and whether an attorney consult would help.

You receive:
1. A deterministic roadmap (stages with evidence-based "current" stage — DO NOT override completion or current stage)
2. A summary of the Living File

Your job: produce a small JSON overlay ONLY inside the markers below. General legal information, not legal advice.

Rules:
- NEVER invent deadlines you cannot ground in the facts provided
- NEVER change which stage is "current" — that is computed elsewhere
- stage_notes: optional plain-English notes keyed by stage key (max 1 sentence each, only where helpful)
- emphasize_stages: stage keys worth the client's attention right now (subset of provided keys)
- consult_recommended: true when a consult would genuinely help (deadlines, high stakes, complex fork)
- consult_reason: one plain sentence why (required if consult_recommended)
- consult_urgency: "low" | "medium" | "high"

Respond with ONLY this block (valid JSON inside):

---ROADMAP OVERLAY---
{
  "stage_notes": { "stage_key": "optional note" },
  "emphasize_stages": ["stage_key"],
  "consult_recommended": false,
  "consult_reason": "",
  "consult_urgency": "low"
}
---END ROADMAP OVERLAY---`;

export function buildRoadmapRefreshUserPrompt(
  roadmap: ResolvedRoadmap,
  matterSummary: string,
  factBullets: string[],
): string {
  const stageList = roadmap.stages
    .map((s) => `- ${s.key} (${s.status}): ${s.title}`)
    .join("\n");

  return `MATTER SUMMARY:
${matterSummary || "(no summary yet)"}

CONFIRMED FACTS:
${factBullets.length ? factBullets.map((f) => `• ${f}`).join("\n") : "(none yet)"}

ROADMAP (${roadmap.blueprintKey}, current stage: ${roadmap.currentStageKey ?? "unknown"}):
${stageList}

Produce the overlay JSON. If nothing needs updating, return consult_recommended: false and empty stage_notes.`;
}

export function parseRoadmapOverlayFromModel(text: string): RoadmapAiOverlay {
  const match = text.match(OVERLAY_JSON_BLOCK);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    const overlay: RoadmapAiOverlay = {};

    if (parsed.stage_notes && typeof parsed.stage_notes === "object") {
      const notes: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed.stage_notes as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) notes[k] = v.trim();
      }
      if (Object.keys(notes).length) overlay.stage_notes = notes;
    }

    if (Array.isArray(parsed.emphasize_stages)) {
      overlay.emphasize_stages = parsed.emphasize_stages.filter((s): s is string => typeof s === "string");
    }

    if (typeof parsed.consult_recommended === "boolean") {
      overlay.consult_recommended = parsed.consult_recommended;
    }
    if (typeof parsed.consult_reason === "string") overlay.consult_reason = parsed.consult_reason.trim();
    if (parsed.consult_urgency === "low" || parsed.consult_urgency === "medium" || parsed.consult_urgency === "high") {
      overlay.consult_urgency = parsed.consult_urgency;
    }

    return overlay;
  } catch {
    return {};
  }
}
