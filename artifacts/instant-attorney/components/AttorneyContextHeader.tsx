"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export const ATTORNEY_WORK_STATE_KEY = "instant-attorney:work-state:v1";

export interface AttorneyWorkState {
  documentId: string;
  documentTitle: string;
  documentStatus: string;
  revision: string;
  caseFileId: string;
  clientId: string;
  clientName: string;
  matter: string;
  href: string;
  openedAt: string;
  dirty?: boolean;
  unresolvedQa?: boolean;
  scrollY?: number;
  section?: string;
}

export function readAttorneyWorkStates(): AttorneyWorkState[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(ATTORNEY_WORK_STATE_KEY) || "[]") as AttorneyWorkState[]; }
  catch { return []; }
}

function writeState(next: AttorneyWorkState) {
  const states = readAttorneyWorkStates().filter((item) => item.documentId !== next.documentId);
  localStorage.setItem(ATTORNEY_WORK_STATE_KEY, JSON.stringify([next, ...states].slice(0, 20)));
  window.dispatchEvent(new Event("attorney-work-state"));
}

export default function AttorneyContextHeader({ context, currentArea = "workbench", client }: {
  context?: Omit<AttorneyWorkState, "openedAt" | "href"> & { href?: string };
  currentArea?: "client" | "file" | "attachments" | "workbench";
  client?: { id: string; name: string };
}) {
  const [restored, setRestored] = useState<AttorneyWorkState | null>(null);
  const active = context ?? restored ?? undefined;
  const stableContext = useMemo(() => context, [context?.documentId, context?.revision, context?.dirty, context?.unresolvedQa]);

  useEffect(() => {
    if (!stableContext) {
      setRestored(client ? (readAttorneyWorkStates().find((item) => item.clientId === client.id) ?? null) : (readAttorneyWorkStates()[0] ?? null));
      return;
    }
    const previous = readAttorneyWorkStates().find((item) => item.documentId === stableContext.documentId);
    const next: AttorneyWorkState = {
      ...stableContext,
      href: stableContext.href ?? `/attorney/review/${stableContext.documentId}`,
      openedAt: new Date().toISOString(),
      scrollY: previous?.scrollY,
      section: previous?.section,
    };
    writeState(next);
    // Captured before the callback: narrowing from `previous?.scrollY` does not
    // survive into the deferred closure, where `previous` is optional again.
    const restoreScrollY = previous?.scrollY;
    if (currentArea === "workbench" && restoreScrollY) {
      requestAnimationFrame(() => window.scrollTo(0, restoreScrollY));
    }
    const savePosition = () => writeState({ ...next, scrollY: window.scrollY, section: location.hash.slice(1) || undefined });
    window.addEventListener("pagehide", savePosition);
    return () => { window.removeEventListener("pagehide", savePosition); savePosition(); };
  }, [stableContext, currentArea, client]);

  const status = active?.documentStatus?.replaceAll("_", " ") ?? "No active document";
  return (
    <header className="attorney-context" aria-label="Attorney document context">
      <div className="attorney-context__crumbs">
        <Link href="/attorney">Attorney</Link><span>/</span>
        {active ? <><Link href={`/attorney/client/${active.clientId}`}>{active.clientName}</Link><span>/</span>
          <Link href={`/attorney/file/${active.caseFileId}?documentId=${active.documentId}`}>{active.matter}</Link><span>/</span>
          <strong>{active.documentTitle}</strong></> : client ? <Link href={`/attorney/client/${client.id}`}><strong>{client.name}</strong></Link> : <strong>Client record</strong>}
      </div>
      <div className="attorney-context__meta">
        <span className="attorney-context__status">{status}</span>
        {active && <span>Active revision: <b>{active.revision}</b></span>}
      </div>
      {active && <nav className="attorney-context__nav" aria-label="Active document locations">
        <Link className={currentArea === "file" ? "is-active" : ""} href={`/attorney/file/${active.caseFileId}?documentId=${active.documentId}`}>Living File</Link>
        <Link className={currentArea === "attachments" ? "is-active" : ""} href={`/attorney/file/${active.caseFileId}?documentId=${active.documentId}#attachments`}>Attachments</Link>
        <Link className={currentArea === "workbench" ? "is-active" : ""} href={`/attorney/review/${active.documentId}`}>Review workbench</Link>
      </nav>}
    </header>
  );
}
