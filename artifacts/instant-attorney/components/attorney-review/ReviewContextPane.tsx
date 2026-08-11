"use client";

import Link from "next/link";
import type { Attachment } from "@/lib/types";

interface Props { clientName: string; email: string; phone?: string | null; matter: string; summary?: string | null; caseFileId: string; submitted: string; attachments: Attachment[]; onRunReview: () => void; running: boolean; hasReview: boolean; error?: string }

export default function ReviewContextPane(props: Props) {
  return <aside className="review-workbench-pane review-context-pane" aria-label="Review context">
    <div className="review-pane-heading"><div><h2>Context</h2><p>Client submission and matter materials</p></div></div>
    <section><h3>Client</h3><p>{props.clientName}</p><p>{props.email}</p>{props.phone && <p>{props.phone}</p>}</section>
    <section><h3>Matter</h3><p>{props.matter}</p>{props.summary && <p>{props.summary}</p>}</section>
    <section><h3>Living File</h3><Link href={`/attorney/file/${props.caseFileId}`}>View full file →</Link><br/><Link href={`/attorney/file/${props.caseFileId}/brief-pack`}>Open brief pack →</Link></section>
    <section><h3>Submitted</h3><p>{props.submitted}</p></section>
    {props.attachments.length > 0 && <section><h3>Attachments</h3>{props.attachments.map((a) => <p key={a.id}>{a.status === "ready" ? <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">{a.file_name} ↗</a> : a.file_name}</p>)}</section>}
    <section><h3>Critical review</h3><button type="button" onClick={props.onRunReview} disabled={props.running}>{props.running ? "Generating…" : props.hasReview ? "Re-run review" : "Run review"}</button>{props.error && <p className="atty-ai-error">{props.error}</p>}</section>
  </aside>;
}
