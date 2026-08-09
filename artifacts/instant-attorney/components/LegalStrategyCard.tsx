"use client";

import { useState } from "react";
import type { LegalStrategy } from "@/lib/types";

// The Legal Strategy card, condensed from a long list into scannable chips.
// Strengths → green chips, Risks → amber chips, Instruments → compact list.
// Each group collapses to its first 3 items by default to cut visual weight.
// The attorney view still shows the full flat list; this component is client-only
// for the expand/collapse interactivity.

const DEFAULT_SHOW = 3;

function ChipGroup({
  items,
  tone,
  label,
}: {
  items: string[];
  tone: "pos" | "neg";
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, DEFAULT_SHOW);
  const hidden = items.length - shown.length;
  return (
    <div className="lf-strategy-chipgroup">
      <div className="lf-strategy-sub">{label}</div>
      <div className="lf-strategy-chips">
        {shown.map((s, i) => (
          <span key={i} className={`lf-strategy-chip lf-strategy-chip-${tone}`}>
            {s}
          </span>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            className="lf-strategy-chip lf-strategy-chip-more"
            onClick={() => setExpanded(true)}
          >
            +{hidden} more
          </button>
        )}
        {expanded && items.length > DEFAULT_SHOW && (
          <button
            type="button"
            className="lf-strategy-chip lf-strategy-chip-more"
            onClick={() => setExpanded(false)}
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

function InstrumentList({ items }: { items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, DEFAULT_SHOW);
  const hidden = items.length - shown.length;
  return (
    <div className="lf-instruments">
      <div className="lf-strategy-sub">
        Suggested documents
        <span className="lf-plain-caption lf-plain-caption-sub">
          Ask for any of these in your legal chat
        </span>
      </div>
      <ul className="lf-list">
        {shown.map((inst, i) => (
          <li key={i}>{inst}</li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="lf-collapsible-toggle"
          onClick={() => setExpanded(true)}
          style={{ marginTop: "0.35rem" }}
        >
          +{hidden} more
        </button>
      )}
      {expanded && items.length > DEFAULT_SHOW && (
        <button
          type="button"
          className="lf-collapsible-toggle"
          onClick={() => setExpanded(false)}
          style={{ marginTop: "0.35rem" }}
        >
          Show less
        </button>
      )}
    </div>
  );
}

export default function LegalStrategyCard({
  strategy,
  isAttorney,
}: {
  strategy: LegalStrategy;
  isAttorney: boolean;
}) {
  return (
    <div className="lf-card lf-card-full lf-card-strategy" id="legal-strategy">
      <div className="lf-card-label">
        Legal Strategy
        {!isAttorney && (
          <span className="lf-plain-caption">Your game plan, in plain terms</span>
        )}
      </div>

      {strategy.summary && (
        <p className="lf-strategy-summary">{strategy.summary}</p>
      )}

      {(strategy.strengths?.length > 0 || strategy.risks?.length > 0) && (
        <div className="lf-strategy-chiprow">
          {strategy.strengths?.length > 0 && (
            <ChipGroup
              items={strategy.strengths}
              tone="pos"
              label="Strengths"
            />
          )}
          {strategy.risks?.length > 0 && (
            <ChipGroup items={strategy.risks} tone="neg" label="Risks" />
          )}
        </div>
      )}

      {strategy.instruments?.length > 0 && (
        <InstrumentList items={strategy.instruments} />
      )}
    </div>
  );
}
