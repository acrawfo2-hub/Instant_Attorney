"use client";

import { useState } from "react";
import type { FactItem } from "@/lib/types";
import ProvabilityFactText from "@/components/ProvabilityFactText";

// How many items each fact card shows before collapsing the rest. The full list
// is always available — clicking the card just reveals it; nothing is ever
// hidden permanently.
const VISIBLE_LIMIT = 20;

interface PlaceholderGroup {
  /** Stable id of the document these blanks came from (React key). */
  docId: string;
  /** Human title of the document these blanks came from. */
  docTitle: string;
  /** The placeholder labels still open in that document. */
  items: string[];
}

interface FactsPanelProps {
  confirmed: FactItem[];
  gaps: FactItem[];
  placeholderGroups: PlaceholderGroup[];
  isAttorney: boolean;
}

// One fact card. When it holds more than VISIBLE_LIMIT items the whole card
// becomes a toggle: clicking (or Enter/Space) expands to the full list and back.
function FactCard({
  cardId,
  title,
  caption,
  emptyText,
  items,
  countClass,
  listClass,
  idPrefix,
}: {
  cardId?: string;
  title: string;
  caption?: string;
  emptyText: string;
  items: FactItem[];
  countClass: string;
  listClass: string;
  idPrefix?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandable = items.length > VISIBLE_LIMIT;
  const shown = expanded ? items : items.slice(0, VISIBLE_LIMIT);
  const hiddenCount = items.length - shown.length;
  const toggle = () => setExpanded((v) => !v);

  return (
    <div
      className={`lf-card lf-card-half${expandable ? " lf-card-clickable" : ""}`}
      id={cardId}
      role={expandable ? "button" : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      onClick={expandable ? toggle : undefined}
      onKeyDown={
        expandable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
              }
            }
          : undefined
      }
    >
      <div className="lf-card-label">
        {title}
        {items.length > 0 && <span className={countClass}>{items.length}</span>}
        {caption && <span className="lf-plain-caption">{caption}</span>}
      </div>
      {items.length > 0 ? (
        <>
          <ul className={listClass}>
            {shown.map((f) => (
              <li key={f.id} id={idPrefix ? `${idPrefix}${f.id}` : undefined}>
                <ProvabilityFactText description={f.description} />
              </li>
            ))}
          </ul>
          {expandable && (
            <span className="lf-expand-btn">
              {expanded ? "Show less" : `Show all ${items.length} — ${hiddenCount} more`}
            </span>
          )}
        </>
      ) : (
        <p className="lf-empty-field">{emptyText}</p>
      )}
    </div>
  );
}

export default function FactsPanel({ confirmed, gaps, placeholderGroups, isAttorney }: FactsPanelProps) {
  const placeholderCount = placeholderGroups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      {/* Confirmed Facts + Open Fact Gaps — always side-by-side, top-aligned. */}
      <div className="lf-pair">
        <FactCard
          title="Confirmed Facts"
          caption={!isAttorney ? "What we know so far" : undefined}
          emptyText="Facts confirmed during intake will appear here."
          items={confirmed}
          countClass="lf-count"
          listClass="lf-list lf-list-confirmed"
        />
        <FactCard
          cardId="fact-gaps"
          title="Open Fact Gaps"
          caption={!isAttorney ? "Details still needed — these are okay to leave for now" : undefined}
          emptyText="Missing facts to track will appear here."
          items={gaps}
          countClass="lf-count lf-count-gap"
          listClass="lf-list lf-list-gap"
          idPrefix="gap-"
        />
      </div>

      {/* Document placeholders — blanks left in drafted documents, grouped by the
          document they came from so client and attorney know exactly where to fill. */}
      {placeholderGroups.length > 0 && (
        <div className="lf-card lf-card-full lf-placeholders" id="document-placeholders">
          <div className="lf-card-label">
            Document Placeholders
            <span className="lf-count lf-count-gap">{placeholderCount}</span>
            <span className="lf-plain-caption">
              Blanks left in your drafted documents — shown under the document each one came from so
              {isAttorney ? " you" : " you and your attorney"} know exactly where to fill them in.
            </span>
          </div>
          {placeholderGroups.map((group) => (
            <div key={group.docId} className="lf-ph-group">
              <div className="lf-ph-doc">{group.docTitle}</div>
              <ul className="lf-list lf-list-gap">
                {group.items.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
