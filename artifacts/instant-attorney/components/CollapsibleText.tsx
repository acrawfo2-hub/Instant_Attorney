"use client";

import { useState, useRef, useEffect } from "react";

// A paragraph that clamps to `lines` lines with a toggle to expand in place.
// Uses CSS line-clamp for the clamped state and removes it when expanded.
// Shows the toggle only when the text is actually long enough to be clamped.

export default function CollapsibleText({
  text,
  lines = 4,
  className = "lf-summary",
  expandLabel = "Read full summary",
  collapseLabel = "Show less",
}: {
  text: string;
  lines?: number;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure before any clamp is applied by temporarily setting overflow visible.
    // We detect overflow by comparing scrollHeight (full) to clientHeight (clamped).
    setOverflows(el.scrollHeight > el.clientHeight + 4);
  }, [text, lines]);

  const clampStyle = !expanded
    ? ({
        display: "-webkit-box",
        WebkitLineClamp: lines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      } as React.CSSProperties)
    : undefined;

  return (
    <div>
      <p ref={ref} className={className} style={clampStyle}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          className="lf-collapsible-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  );
}
