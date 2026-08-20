"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AttorneyOnboardClient from "@/components/AttorneyOnboardClient";

export interface AttorneyMatterOption {
  id: string;
  clientName: string;
  matterName: string;
  nextAction: string | null;
}

export default function AttorneyWorkLauncher({ matters }: { matters: AttorneyMatterOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return matters.slice(0, 8);
    return matters.filter((matter) => `${matter.clientName} ${matter.matterName} ${matter.nextAction ?? ""}`.toLowerCase().includes(needle)).slice(0, 20);
  }, [matters, query]);

  return (
    <section className="atty-launcher" aria-labelledby="atty-launcher-title">
      <div>
        <span className="atty-launcher__eyebrow">Matter workspace</span>
        <h1 id="atty-launcher-title">What do you need to work on?</h1>
        <p>Find any client matter, or bring a new client from your practice into a protected workspace.</p>
      </div>
      <div className="atty-launcher__controls">
        <div className="atty-launcher__picker">
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            <span aria-hidden>⌕</span><span>Search clients and matters</span><span aria-hidden>⌄</span>
          </button>
          {open && <div className="atty-launcher__menu">
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Client, matter, or next action…" aria-label="Search clients and matters" />
            <div className="atty-launcher__results">
              {results.map((matter) => <button key={matter.id} type="button" onClick={() => router.push(`/attorney/workbench/${matter.id}`)}>
                <span><strong>{matter.clientName}</strong><small>{matter.matterName}</small></span>
                <span className="atty-launcher__next">{matter.nextAction || "Open workbench"} →</span>
              </button>)}
              {results.length === 0 && <p>No matching client matters.</p>}
            </div>
          </div>}
        </div>
        <AttorneyOnboardClient compact />
      </div>
    </section>
  );
}
