/**
 * Provability lens — parse inline evidentiary tags on fact descriptions.
 *
 * Tags live in the text itself (no schema column). Convention from prompts:
 *   [established: …] | [asserted: …] | [characterization/opinion…]
 */

export type ProvabilityLevel = "established" | "asserted" | "opinion" | "unknown";

export interface ProvabilityParse {
  level: ProvabilityLevel;
  /** Human label for the badge */
  label: string;
  /** Evidence / source note inside the brackets, if any */
  detail: string | null;
  /** Description with the tag stripped for clean display */
  displayText: string;
}

const TAG_RE =
  /\[(established|asserted|characterization(?:\/opinion)?|opinion)(?::\s*([^\]]+))?\]/i;

export function parseProvabilityTag(description: string): ProvabilityParse {
  const m = description.match(TAG_RE);
  if (!m) {
    return {
      level: "unknown",
      label: "",
      detail: null,
      displayText: description.trim(),
    };
  }

  const raw = m[1].toLowerCase();
  const detail = m[2]?.trim() || null;
  let level: ProvabilityLevel = "unknown";
  let label = "";

  if (raw === "established") {
    level = "established";
    label = "Established";
  } else if (raw === "asserted") {
    level = "asserted";
    label = "Asserted";
  } else {
    level = "opinion";
    label = "Opinion";
  }

  const displayText = description.replace(TAG_RE, "").replace(/\s{2,}/g, " ").trim();

  return { level, label, detail, displayText };
}
