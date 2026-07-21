"use client";

import type { StatuteChipData } from "@/lib/statute-lookup";
import { resolveStatutes } from "@/lib/statute-lookup";

/**
 * Clickable chips that deep-link to the official .gov text for a statute key.
 */
export default function StatuteChips({
  keys,
  statutes,
  label = "Governing law",
}: {
  keys?: string[];
  statutes?: StatuteChipData[];
  label?: string;
}) {
  const items = statutes ?? (keys ? resolveStatutes(keys) : []);
  if (items.length === 0) return null;

  return (
    <div className="statute-chips" aria-label={label}>
      <span className="statute-chips-label">{label}</span>
      <div className="statute-chips-row">
        {items.map((s) => (
          <a
            key={s.key}
            href={s.official_url}
            target="_blank"
            rel="noopener noreferrer"
            className="statute-chip"
            title={s.topic}
          >
            <span className="statute-chip-code">{s.code}</span>
            <span className="statute-chip-ext" aria-hidden="true">↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
