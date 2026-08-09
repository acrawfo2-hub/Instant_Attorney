"use client";

import { useState, useEffect } from "react";

// Quick-jump nav for the client case file. Renders as a horizontal pill strip
// that sticks below the header once the user scrolls past the CaseHub/tiles,
// then highlights the section nearest the top of the viewport as they scroll.
//
// `sections` carries only the sections actually rendered on this file (e.g.
// deadlines is omitted when docketCount === 0) so no pill links to a ghost.

const ALL_SECTIONS = [
  { id: "documents",   label: "Documents" },
  { id: "deadlines",   label: "Key Dates" },
  { id: "case-details",label: "Case Details" },
  { id: "facts",       label: "Facts" },
  { id: "strength",    label: "Strength" },
  { id: "help",        label: "Help" },
] as const;

type SectionId = (typeof ALL_SECTIONS)[number]["id"];

export default function SectionJumpBar({
  sections,
  chatHref,
}: {
  sections: SectionId[];
  /** Link to the case-specific chat. When provided a gold "Continue in chat →"
   *  pill is rendered at the far right of the nav. */
  chatHref?: string;
}) {
  const [active, setActive] = useState<SectionId | null>(null);
  const [sticky, setSticky] = useState(false);

  const visible = ALL_SECTIONS.filter((s) => sections.includes(s.id));

  useEffect(() => {
    // Track which section is nearest the top of the viewport and update the
    // active pill. We scan bottom-up so the first section whose top is at or
    // above the threshold wins.
    function updateActive() {
      // 52px header + 52px this bar's own height → 104px total offset
      const threshold = 110;
      let found: SectionId | null = null;
      for (const { id } of [...visible].reverse()) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= threshold) {
          found = id;
          break;
        }
      }
      setActive(found);
    }

    // Become sticky once the sentinel (first section) has scrolled past the bar.
    function updateSticky() {
      const first = document.getElementById("documents");
      if (!first) return;
      setSticky(first.getBoundingClientRect().top < 105);
    }

    function onScroll() {
      updateActive();
      updateSticky();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    updateActive();
    updateSticky();
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.join(",")]);

  return (
    <nav
      className={`lf-section-nav${sticky ? " lf-section-nav-sticky" : ""}`}
      aria-label="Jump to section"
    >
      {visible.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className={`lf-section-nav-pill${active === id ? " lf-section-nav-pill-active" : ""}`}
        >
          {label}
        </a>
      ))}
      {chatHref && (
        <a
          href={chatHref}
          className="lf-section-nav-pill lf-section-nav-pill-chat"
        >
          Continue in chat →
        </a>
      )}
    </nav>
  );
}
