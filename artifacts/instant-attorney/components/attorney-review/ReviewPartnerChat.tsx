"use client";

import type { FormEvent } from "react";
import { ASSOCIATE_SHORTCUTS, type AssociateShortcutId } from "@/lib/associate-shortcuts";

export interface PartnerMessage { role: "user" | "assistant"; content: string }

interface Props {
  messages: PartnerMessage[];
  input: string;
  sending: boolean;
  disabled?: boolean;
  error?: string;
  onInput: (text: string) => void;
  onSend: () => void;
  onShortcut?: (id: AssociateShortcutId) => void;
}

export default function ReviewPartnerChat({
  messages, input, sending, disabled, error, onInput, onSend, onShortcut,
}: Props) {
  const submit = (event: FormEvent) => { event.preventDefault(); onSend(); };
  return <aside className="review-workbench-pane review-partner-pane" aria-label="Junior associate">
    <div className="review-pane-heading">
      <div>
        <h2>Junior associate</h2>
        <p>Edits land in the working copy as you talk. The client sees nothing until you approve.</p>
      </div>
    </div>
    <div className="review-associate-shortcuts" role="toolbar" aria-label="Specialists">
      {ASSOCIATE_SHORTCUTS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="atty-comment-link"
          disabled={sending || disabled}
          onClick={() => onShortcut?.(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
    <div className="review-partner-messages">
      {messages.length === 0 && <p className="atty-comment-empty">Ask a question, talk through a weakness, or send a specialist. Fixes apply as you go.</p>}
      {messages.map((message, index) => <div key={index} className={`review-partner-message review-partner-${message.role}`}><strong>{message.role === "user" ? "You" : "Associate"}</strong><p>{message.content}</p></div>)}
    </div>
    <form onSubmit={submit} className="review-partner-compose">
      <textarea
        value={input}
        onChange={(e) => onInput(e.target.value)}
        disabled={sending || disabled}
        rows={4}
        placeholder={disabled ? "Wait for draft generation to finish…" : "Ask, discuss, or tell me what to fix…"}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
      />
      <button type="submit" disabled={sending || disabled || !input.trim()}>{sending ? "Working…" : "Send"}</button>
    </form>
    {error && <p className="atty-ai-error">{error}</p>}
  </aside>;
}
