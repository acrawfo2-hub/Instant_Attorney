"use client";

import type { FormEvent } from "react";

export interface PartnerMessage { role: "user" | "assistant"; content: string }

interface Props { messages: PartnerMessage[]; input: string; sending: boolean; disabled?: boolean; error?: string; onInput: (text: string) => void; onSend: () => void }

export default function ReviewPartnerChat({ messages, input, sending, disabled, error, onInput, onSend }: Props) {
  const submit = (event: FormEvent) => { event.preventDefault(); onSend(); };
  return <aside className="review-workbench-pane review-partner-pane" aria-label="AI review partner">
    <div className="review-pane-heading"><div><h2>AI partner</h2><p>Edits arrive as proposals. Nothing changes until you accept it.</p></div></div>
    <div className="review-partner-messages">
      {messages.length === 0 && <p className="atty-comment-empty">Ask for a targeted change, redline, or alternative language.</p>}
      {messages.map((message, index) => <div key={index} className={`review-partner-message review-partner-${message.role}`}><strong>{message.role === "user" ? "You" : "Partner"}</strong><p>{message.content}</p></div>)}
    </div>
    <form onSubmit={submit} className="review-partner-compose"><textarea value={input} onChange={(e) => onInput(e.target.value)} disabled={sending || disabled} rows={4} placeholder={disabled ? "Wait for draft generation to finish…" : "Propose a change to this revision…"} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }} /><button type="submit" disabled={sending || disabled || !input.trim()}>{sending ? "Drafting proposal…" : "Propose changes"}</button></form>
    {error && <p className="atty-ai-error">{error}</p>}
  </aside>;
}
