"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface AttorneyMatterItem { id: string; title: string; nextAction: string | null }

export default function AttorneyMatterSwitcher({
  clientId, clientName, currentId, matters,
}: { clientId: string; clientName: string; currentId: string; matters: AttorneyMatterItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = matters.find((matter) => matter.id === currentId);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!current) return null;
  return (
    <div className="matter-switcher" ref={root}>
      <button type="button" className="matter-switcher-trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="matter-switcher-label">{clientName}</span>
        <span className="matter-switcher-title">{current.title}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && <div className="matter-switcher-menu">
        <div className="matter-switcher-menu-head">{clientName}&apos;s matters</div>
        {matters.map((matter) => <Link
          key={matter.id}
          href={`/attorney/file/${matter.id}`}
          className={`matter-switcher-item${matter.id === currentId ? " matter-switcher-item--current" : ""}`}
          onClick={() => setOpen(false)}
        >
          <span className="matter-switcher-item-title">{matter.title}</span>
          <span className="matter-switcher-item-next">{matter.nextAction || "No next step yet"}</span>
          {matter.id === currentId && <span className="matter-switcher-item-badge">Current</span>}
        </Link>)}
        <Link href={`/attorney/client/${clientId}`} className="matter-switcher-all">View client →</Link>
      </div>}
    </div>
  );
}
