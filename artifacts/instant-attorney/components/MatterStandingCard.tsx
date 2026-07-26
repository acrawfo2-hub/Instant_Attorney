"use client";

import { useState, useCallback } from "react";
import type { MatterTask } from "@/lib/matter-tasks";

interface AssessResult {
  done: MatterTask[];
  doableNow: MatterTask[];
  blocked: MatterTask[];
  counts: { done: number; doableNow: number; blocked: number };
  narrative: string;
}

const URGENCY_DOT: Record<string, string> = {
  expired: "ms-dot-expired",
  critical: "ms-dot-critical",
  warning: "ms-dot-warning",
  normal: "ms-dot-normal",
};

// "Where things stand" — the consumer-facing read of the matter synthesizer
// (plan Phase 1). Deterministic buckets from /api/assess-matter with a short
// grounded narrative. Load-on-demand so it never slows the file's first paint.
export default function MatterStandingCard({ caseFileId }: { caseFileId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [data, setData] = useState<AssessResult | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/assess-matter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFileId }),
      });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setState("ready");
    } catch {
      setState("error");
    }
  }, [caseFileId]);

  if (state === "idle") {
    return (
      <div className="lf-card lf-card-full ms-card">
        <div className="ms-head">
          <span className="ms-title">Where things stand</span>
          <button type="button" className="ms-run-btn" onClick={load}>
            Check my matter
          </button>
        </div>
        <p className="ms-sub">
          A quick, prioritized read of what you can do now, what&apos;s waiting, and what&apos;s done.
        </p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="lf-card lf-card-full ms-card">
        <div className="ms-head"><span className="ms-title">Where things stand</span></div>
        <p className="ms-sub">Reading your file…</p>
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div className="lf-card lf-card-full ms-card">
        <div className="ms-head">
          <span className="ms-title">Where things stand</span>
          <button type="button" className="ms-run-btn" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  const bucket = (label: string, items: MatterTask[], cls: string) =>
    items.length > 0 && (
      <div className={`ms-bucket ${cls}`}>
        <div className="ms-bucket-head">
          {label} <span className="ms-bucket-count">{items.length}</span>
        </div>
        <ul className="ms-list">
          {items.map((t) => (
            <li key={t.id} className="ms-item">
              <span className={`ms-dot ${URGENCY_DOT[t.urgency] ?? "ms-dot-normal"}`} aria-hidden />
              <span className="ms-item-body">
                {t.href ? <a className="ms-item-title" href={t.href}>{t.title}</a> : <span className="ms-item-title">{t.title}</span>}
                {t.blockedBy?.length ? <span className="ms-item-blocked">Waiting on: {t.blockedBy.join(", ")}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="lf-card lf-card-full ms-card">
      <div className="ms-head">
        <span className="ms-title">Where things stand</span>
        <button type="button" className="ms-run-btn ms-run-btn-ghost" onClick={load}>Refresh</button>
      </div>
      {data.narrative && <p className="ms-narrative">{data.narrative}</p>}
      <div className="ms-buckets">
        {bucket("Do now", data.doableNow, "ms-bucket-now")}
        {bucket("Blocked", data.blocked, "ms-bucket-blocked")}
        {bucket("Done", data.done, "ms-bucket-done")}
      </div>
      <p className="ms-foot">
        Not sure how to tackle these? <a href={`/chat?caseFileId=${caseFileId}&mode=freestyle`}>Talk it through with your assistant →</a>
      </p>
    </div>
  );
}
