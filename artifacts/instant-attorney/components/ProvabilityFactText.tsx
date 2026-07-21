"use client";

import { parseProvabilityTag, type ProvabilityLevel } from "@/lib/provability";

function badgeClass(level: ProvabilityLevel): string {
  if (level === "established") return "prov-badge prov-badge--established";
  if (level === "asserted") return "prov-badge prov-badge--asserted";
  if (level === "opinion") return "prov-badge prov-badge--opinion";
  return "";
}

/**
 * Renders a fact description with an established / asserted / opinion badge
 * when an inline evidentiary tag is present.
 */
export default function ProvabilityFactText({ description }: { description: string }) {
  const parsed = parseProvabilityTag(description);
  if (parsed.level === "unknown") {
    return <>{description}</>;
  }

  return (
    <span className="prov-fact">
      <span
        className={badgeClass(parsed.level)}
        title={parsed.detail ? `${parsed.label}: ${parsed.detail}` : parsed.label}
      >
        {parsed.label}
      </span>
      <span className="prov-fact-text">{parsed.displayText}</span>
    </span>
  );
}
