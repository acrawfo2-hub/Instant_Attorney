"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { GovFormInstrument } from "@/lib/types";

interface FormProgress {
  total_required: number;
  answered_required: number;
  percent: number;
  complete: boolean;
}

interface EnrichedInstrument extends GovFormInstrument {
  verified: boolean;
  form: {
    form_number: string;
    title: string;
    agency: string;
    jurisdiction: string;
    official_url: string;
    deadline: string;
    field_count: number;
  };
  progress: FormProgress;
}

interface GovFormInstrumentsProps {
  caseFileId: string;
}

// Surfaces government forms detected in chat as "legal instruments to complete."
// The guided-completion tool (/forms/:id) walks the client through each one.
export default function GovFormInstruments({ caseFileId }: GovFormInstrumentsProps) {
  const [instruments, setInstruments] = useState<EnrichedInstrument[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/gov-forms?caseFileId=${caseFileId}`);
    if (res.ok) {
      const data = await res.json();
      setInstruments(data.instruments ?? []);
    }
    setLoaded(true);
  }, [caseFileId]);

  useEffect(() => { load(); }, [load]);

  // Nothing to show until at least one form is detected.
  if (!loaded || instruments.length === 0) return null;

  return (
    <div className="lf-card lf-card-full">
      <div className="lf-card-label">
        Government Forms to Complete
        <span className="lf-count">{instruments.length}</span>
        <span className="lf-plain-caption">Forms we detected you likely need — we&apos;ll guide you through each</span>
      </div>
      <ul className="lf-list">
        {instruments.map((inst) => {
          const completed = inst.status === "completed";
          const looking = inst.source === "dynamic" && inst.lookup_status === "pending";
          const lookupFailed = inst.source === "dynamic" && inst.lookup_status === "failed";
          const guidable = inst.form.field_count > 0;

          let action: ReactNode;
          if (completed) {
            action = <span className="lf-inst-done">✓ Completed</span>;
          } else if (looking) {
            action = <span className="lf-inst-pending">Looking up form…</span>;
          } else if (!guidable && inst.form.official_url) {
            // Lookup couldn't build a field schema — point to the official form.
            action = (
              <a href={inst.form.official_url} target="_blank" rel="noopener" className="lf-inst-start-btn">
                Open official form ↗
              </a>
            );
          } else if (guidable) {
            action = (
              <Link href={`/forms/${inst.id}`} className="lf-inst-start-btn">
                {inst.status === "in_progress" ? `Continue (${inst.progress.percent}%) →` : "Start Form →"}
              </Link>
            );
          } else {
            action = <span className="lf-inst-pending">Unavailable</span>;
          }

          return (
            <li key={inst.id} className="lf-inst-row">
              <span className="lf-inst-text">
                <strong>{inst.form.form_number}</strong> — {inst.form.title}
                {!inst.verified && <span className="gf-badge-unverified">Unverified — confirm at source</span>}
                <span className="lf-inst-sub">
                  {inst.form.agency} · {inst.form.jurisdiction} · ⏱ {inst.form.deadline}
                </span>
                {inst.reason && <span className="lf-inst-reason">{inst.reason}</span>}
                {lookupFailed && !guidable && (
                  <span className="lf-inst-reason">We couldn&apos;t auto-build a guide for this one — use the official link.</span>
                )}
              </span>
              {action}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
