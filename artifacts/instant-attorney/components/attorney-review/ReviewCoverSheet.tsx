"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { computeDocket } from "@/lib/docket";
import type { Attachment, FactItem, RequestedAttachment } from "@/lib/types";

interface ReviewContext {
  caseFile: {
    id: string; matter_type: string | null; matter_subtype: string | null;
    summary: string | null; goals: string[]; jurisdiction: string | null;
    has_existing_counsel: boolean | null; existing_counsel_name: string | null;
    counsel_engagement_goal: string | null; counsel_intake_at: string | null;
  };
  facts: FactItem[];
  intakeMessages: { id: string; role: "user" | "assistant"; content: string; created_at: string }[];
  requestedAttachments: RequestedAttachment[];
  attachments: Attachment[];
}

const SourceBadge = ({ source }: { source: "client" | "ai" | "attorney" }) => (
  <span className={`rcs-source rcs-source-${source}`}>
    {source === "client" ? "Client-provided" : source === "ai" ? "AI-derived" : "Attorney-confirmed"}
  </span>
);

const fmt = (date: string) => new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function ReviewCoverSheet({ documentId, fallbackCaseFileId }: { documentId: string; fallbackCaseFileId: string }) {
  const [context, setContext] = useState<ReviewContext | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/attorney/documents/${documentId}/review-context`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Review context could not be loaded.");
        return response.json() as Promise<ReviewContext>;
      })
      .then((data) => { if (active) setContext(data); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [documentId]);

  const deadlines = useMemo(() => context ? computeDocket(context.facts, new Date(), context.caseFile.jurisdiction) : [], [context]);
  const caseFileId = context?.caseFile.id ?? fallbackCaseFileId;
  if (error) return <div className="rcs-error" role="alert">{error}</div>;
  if (!context) return <div className="rcs-loading">Loading review cover sheet…</div>;
  const { caseFile, facts, attachments, requestedAttachments, intakeMessages } = context;
  const settledFacts = facts.filter((fact) => fact.status === "confirmed" && fact.kind !== "hypothetical");
  const gaps = facts.filter((fact) => fact.status === "gap");

  return (
    <aside className="rcs" aria-label="Case review cover sheet">
      <div className="rcs-heading"><div><span className="rcs-eyebrow">Review cover sheet</span><h2>{caseFile.matter_type ?? "Unclassified matter"}</h2></div><span className="rcs-count">{attachments.length} files</span></div>
      <div className="rcs-legend"><SourceBadge source="client" /><SourceBadge source="ai" /><SourceBadge source="attorney" /></div>

      <section><h3>Quick orientation</h3>
        {caseFile.summary && <div className="rcs-item"><SourceBadge source="ai" /><p>{caseFile.summary}</p></div>}
        <dl className="rcs-meta"><div><dt>Jurisdiction</dt><dd>{caseFile.jurisdiction ?? "Not confirmed"}</dd></div><div><dt>Goals</dt><dd>{caseFile.goals?.length ? caseFile.goals.join(" · ") : "Not stated"}</dd></div></dl>
      </section>

      <section><h3>Facts <span>{settledFacts.length}</span></h3><ul className="rcs-list">{settledFacts.slice(0, 8).map(f => <li key={f.id}><SourceBadge source="client" />{f.description}</li>)}</ul>{settledFacts.length > 8 && <p className="rcs-muted">+ {settledFacts.length - 8} more in the Living File</p>}</section>
      <section className="rcs-gaps"><h3>Open gaps <span>{gaps.length}</span></h3>{gaps.length ? <ul className="rcs-list">{gaps.map(g => <li key={g.id}><SourceBadge source="ai" />{g.description}</li>)}</ul> : <p className="rcs-muted">No open fact gaps.</p>}</section>
      <section><h3>Deadlines <span>{deadlines.length}</span></h3>{deadlines.length ? deadlines.map(d => <div className={`rcs-deadline rcs-deadline-${d.urgency}`} key={d.id}><strong>{fmt(d.deadlineDate)}</strong><span>{d.label}</span><SourceBadge source="ai" /></div>) : <p className="rcs-muted">No deadlines computed from the file.</p>}</section>

      <section><h3>Existing counsel</h3><div className="rcs-item"><SourceBadge source="client" /><p>{caseFile.has_existing_counsel ? `${caseFile.existing_counsel_name ?? "Other counsel (name not supplied)"}${caseFile.counsel_engagement_goal ? ` · ${caseFile.counsel_engagement_goal.replaceAll("_", " ")}` : ""}` : caseFile.has_existing_counsel === false ? "Client reports no existing counsel." : "Not answered."}</p></div></section>
      <section><h3>Requested documents <span>{requestedAttachments.length}</span></h3>{requestedAttachments.length ? <ul className="rcs-list">{requestedAttachments.map(item => <li key={item.id}><SourceBadge source={item.source === "attorney" ? "attorney" : "ai"} /><span>{item.description}<small>{item.status}{item.reason ? ` · ${item.reason}` : ""}</small></span></li>)}</ul> : <p className="rcs-muted">None requested.</p>}</section>

      <section><h3>Source files <span>{attachments.length}</span></h3><div className="rcs-files">{attachments.map(file => <details key={file.id} className="rcs-file"><summary><span><strong>{file.file_name}</strong><small>{fmt(file.created_at)} · {file.status === "ready" ? "Extraction ready" : file.status === "processing" ? "Extracting" : "Extraction failed"}</small></span><span aria-hidden>⌄</span></summary><div><SourceBadge source="ai" /><p>{file.ai_summary ?? "No AI summary available."}</p>{file.status === "ready" && <nav><a href={`/api/attachments/${file.id}`} target="_blank" rel="noopener noreferrer">View</a><a href={`/api/attachments/${file.id}`} download>Download</a></nav>}</div></details>)}</div></section>

      <details className="rcs-transcript"><summary>Intake messages <span>{intakeMessages.length}</span></summary>{intakeMessages.map(message => <div key={message.id} className="rcs-message"><SourceBadge source={message.role === "user" ? "client" : "ai"} /><p>{message.content}</p><small>{fmt(message.created_at)}</small></div>)}</details>
      <Link className="rcs-full-file" href={`/attorney/file/${caseFileId}`}>Open full Living File <span>→</span></Link>
    </aside>
  );
}
