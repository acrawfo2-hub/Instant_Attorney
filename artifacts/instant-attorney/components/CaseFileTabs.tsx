"use client";

import React, { useState } from "react";
import Link from "next/link";

type TabId = "documents" | "case-details" | "facts" | "strength" | "help";

const TABS: { id: TabId; label: string }[] = [
  { id: "documents",    label: "Documents" },
  { id: "case-details", label: "Case Details" },
  { id: "facts",        label: "Facts" },
  { id: "strength",     label: "Strength" },
  { id: "help",         label: "Help" },
];

export default function CaseFileTabs({
  chatHref,
  documentsPanel,
  caseDetailsPanel,
  factsPanel,
  strengthPanel,
  helpPanel,
}: {
  chatHref: string;
  documentsPanel: React.ReactNode;
  caseDetailsPanel: React.ReactNode;
  factsPanel: React.ReactNode;
  strengthPanel: React.ReactNode;
  helpPanel: React.ReactNode;
}) {
  const [active, setActive] = useState<TabId>("documents");

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
              onClick={() => setActive(id)}
              aria-selected={active === id}
              role="tab"
            >
              {label}
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
