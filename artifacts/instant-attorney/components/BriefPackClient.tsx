"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ConsultBriefSnapshot } from "@/lib/consult-brief";

interface BriefPackPayload {
  caseFileId: string;
  snapshot: ConsultBriefSnapshot;
  draftExcerpts: {
    id: string;
    title: string;
    doc_type: string;
    status: string;
    excerpt: string;
    downloadHref: string;
  }[];
  attachments: { id: string; file_name: string; status: string; href: string }[];
  livingFileHref: string;
}

/**
 * Printable one-page attorney brief pack: Living File snapshot, gaps, drafts,
 * roadmap cues, and attachment links. Open and print (or Save as PDF).
 */
export default function BriefPackClient({
  caseFileId,
  consultId,
}: {
  caseFileId: string;
  consultId?: string | null;
}) {
  const [pack, setPack] = useState<BriefPackPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = consultId ? `?consultId=${encodeURIComponent(consultId)}` : "";
      const res = await fetch(`/api/attorney/case-files/${caseFileId}/brief-pack${qs}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to load brief pack");
      }
      setPack((await res.json()) as BriefPackPayload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load brief pack");
    } finally {
      setLoading(false);
    }
  }, [caseFileId, consultId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="brief-pack-shell"><p className="brief-pack-muted">Building brief pack…</p></div>;
  }
  if (error || !pack) {
    return (
      <div className="brief-pack-shell">
        <p className="brief-pack-error">{error || "Unavailable"}</p>
        <Link href={`/attorney/file/${caseFileId}`}>Back to Living File</Link>
      </div>
    );
  }

  const s = pack.snapshot;

  return (
    <div className="brief-pack-shell">
      <div className="brief-pack-toolbar no-print">
        <Link href={pack.livingFileHref} className="brief-pack-back">← Living File</Link>
        <div className="brief-pack-toolbar-actions">
          <button type="button" className="brief-pack-print" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </div>

      <article className="brief-pack">
        <header className="brief-pack-header">
          <p className="brief-pack-eyebrow">Crawford Law PLLC · Attorney brief pack</p>
          <h1>{s.matter.title || "Untitled matter"}</h1>
          <p className="brief-pack-meta">
            {[s.matter.type, s.matter.subtype, s.matter.jurisdiction].filter(Boolean).join(" · ") || "Unclassified"}
          </p>
          {s.summary && <p className="brief-pack-summary">{s.summary}</p>}
        </header>

        <section>
          <h2>Roadmap &amp; next action</h2>
          <ul>
            {s.timeline.currentStage && <li><strong>Stage:</strong> {s.timeline.currentStage}</li>}
            {s.timeline.pathLabel && <li><strong>Path:</strong> {s.timeline.pathLabel}</li>}
            {s.timeline.nextAction && <li><strong>Next:</strong> {s.timeline.nextAction}</li>}
            {s.timeline.urgentNote && <li className="brief-pack-urgent"><strong>Urgent:</strong> {s.timeline.urgentNote}</li>}
          </ul>
        </section>

        {s.goals.length > 0 && (
          <section>
            <h2>Goals</h2>
            <ul>{s.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </section>
        )}

        <section>
          <h2>Strategy</h2>
          {s.strategy.summary && <p>{s.strategy.summary}</p>}
          {s.strategy.recommendConsult && (
            <p className="brief-pack-flag">Consult recommended</p>
          )}
          {s.strategy.strengths.length > 0 && (
            <>
              <h3>Strengths</h3>
              <ul>{s.strategy.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          )}
          {s.strategy.risks.length > 0 && (
            <>
              <h3>Risks</h3>
              <ul>{s.strategy.risks.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          )}
        </section>

        <section>
          <h2>Open gaps ({s.openGaps.length})</h2>
          {s.openGaps.length === 0 ? (
            <p className="brief-pack-muted">No open fact gaps.</p>
          ) : (
            <ul>{s.openGaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
          )}
          <p className="brief-pack-muted">{s.confirmedFactCount} confirmed facts on file.</p>
        </section>

        <section>
          <h2>Documents</h2>
          <p>
            {s.documents.uploaded}/{Math.max(s.documents.requested - s.documents.waived, 0)} requested uploads ·{" "}
            {s.documents.onFile} drafts on file
          </p>
          {s.documents.missing.length > 0 && (
            <>
              <h3>Still missing</h3>
              <ul>
                {s.documents.missing.map((m, i) => (
                  <li key={i}>{m.description}{m.reason ? ` — ${m.reason}` : ""}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        {pack.draftExcerpts.length > 0 && (
          <section>
            <h2>Draft excerpts</h2>
            {pack.draftExcerpts.map((d) => (
              <div key={d.id} className="brief-pack-draft">
                <div className="brief-pack-draft-head">
                  <strong>{d.title}</strong>
                  <span className="brief-pack-muted">{d.doc_type} · {d.status}</span>
                  <a href={d.downloadHref} className="no-print">Download .docx</a>
                </div>
                <pre className="brief-pack-excerpt">{d.excerpt}</pre>
              </div>
            ))}
          </section>
        )}

        <section>
          <h2>Attachments ({pack.attachments.length})</h2>
          {pack.attachments.length === 0 ? (
            <p className="brief-pack-muted">No attachments uploaded.</p>
          ) : (
            <ul>
              {pack.attachments.map((a) => (
                <li key={a.id}>
                  <a href={a.href}>{a.file_name}</a>
                  <span className="brief-pack-muted"> · {a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {s.preConsultMemo && (
          <section>
            <h2>Pre-consult memo</h2>
            <pre className="brief-pack-excerpt">{s.preConsultMemo}</pre>
          </section>
        )}

        <footer className="brief-pack-footer">
          Attorney work product — do not send to client as-is. Generated for review / consult prep.
        </footer>
      </article>
    </div>
  );
}
