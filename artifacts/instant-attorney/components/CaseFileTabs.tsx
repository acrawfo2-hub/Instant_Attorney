"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { type TabId, readStoredTab, writeStoredTab } from "@/lib/tab-storage";

const TABS: { id: TabId; label: string }[] = [
  { id: "documents",    label: "Documents" },
  { id: "case-details", label: "Case Details" },
  { id: "facts",        label: "Facts" },
  { id: "strength",     label: "Strength" },
  { id: "help",         label: "Help" },
];

export default function CaseFileTabs({
  chatHref,
  caseFileId,
  documentsPanel,
  caseDetailsPanel,
  factsPanel,
  strengthPanel,
  helpPanel,
  documentsBadge,
}: {
  chatHref: string;
  /** Used to namespace the localStorage key so each case file remembers its own tab. */
  caseFileId: string;
  documentsPanel: React.ReactNode;
  caseDetailsPanel: React.ReactNode;
  factsPanel: React.ReactNode;
  strengthPanel: React.ReactNode;
  helpPanel: React.ReactNode;
  /** Count of documents/drafts with unfilled blanks — renders an amber badge on
   *  the Documents pill when > 0. Pass null or 0 to show nothing. */
  documentsBadge?: number | null;
}) {
  // Default to "documents"; a useEffect restores the persisted tab after mount
  // so the server-rendered HTML and the first client paint agree (no hydration
  // mismatch), then the correct tab is selected before the user can interact.
  const [active, setActive] = useState<TabId>("documents");

  useEffect(() => {
    // Always reset — resolves to stored tab or the default "documents".
    // Running unconditionally (not just when stored != null) prevents a previous
    // case's active tab from bleeding into a newly-opened case that has no
    // saved value yet.
    setActive(readStoredTab(caseFileId) ?? "documents");
  }, [caseFileId]);

  function switchTab(id: TabId) {
    setActive(id);
    writeStoredTab(caseFileId, id);
  }

  const panels: Record<TabId, React.ReactNode> = {
    "documents":    documentsPanel,
    "case-details": caseDetailsPanel,
    "facts":        factsPanel,
    "strength":     strengthPanel,
    "help":         helpPanel,
  };

  return (
    <div className="lf-tabs-wrap">
      <nav className="lf-tabs" aria-label="Case file sections">
        <div className="lf-tabs-pills">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`lf-tab-pill${active === id ? " lf-tab-pill-active" : ""}`}
              onClick={() => switchTab(id)}
              aria-selected={active === id}
              role="tab"
            >
              {label}
              {id === "documents" && documentsBadge != null && documentsBadge > 0 && (
                <span className="lf-tab-badge" aria-label={`${documentsBadge} document${documentsBadge === 1 ? "" : "s"} need your input`}>
                  {documentsBadge}
                </span>
              )}
            </button>
          ))}
        </div>
        <Link href={chatHref} className="lf-tab-pill lf-tab-pill-chat">
          Continue in chat →
        </Link>
      </nav>
      <div className="lf-tab-panel" role="tabpanel">
        {panels[active]}
      </div>
    </div>
  );
}
