"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readAttorneyWorkStates, type AttorneyWorkState } from "./AttorneyContextHeader";

export default function ContinueWorking({ actionable }: { actionable: AttorneyWorkState[] }) {
  const [items, setItems] = useState<AttorneyWorkState[]>(actionable);
  useEffect(() => {
    const refresh = () => {
      const merged = [...readAttorneyWorkStates(), ...actionable].reduce<AttorneyWorkState[]>((all, item) =>
        all.some((candidate) => candidate.documentId === item.documentId) ? all : [...all, item], []);
      const priority = (item: AttorneyWorkState) => item.dirty ? 0 : item.unresolvedQa ? 1 : item.documentStatus === "pending_review" || item.documentStatus === "changes_requested" ? 2 : 3;
      setItems(merged.sort((a, b) => priority(a) - priority(b) || Date.parse(b.openedAt) - Date.parse(a.openedAt)).slice(0, 8));
    };
    refresh();
    window.addEventListener("attorney-work-state", refresh);
    return () => window.removeEventListener("attorney-work-state", refresh);
  }, [actionable]);
  if (!items.length) return <div className="atty-empty">Open a document to pick up where you left off.</div>;
  return <div className="continue-working">{items.map((item) => <Link href={item.href} className="continue-working__item" key={item.documentId}>
    <div><strong>{item.documentTitle}</strong><span>{item.clientName} · {item.matter}</span></div>
    <div className="continue-working__reason">{item.dirty ? "Unsaved draft" : item.unresolvedQa ? "QA findings" : ["pending_review", "changes_requested"].includes(item.documentStatus) ? "Attorney action" : `Revision ${item.revision}`}<b>Continue →</b></div>
  </Link>)}</div>;
}
