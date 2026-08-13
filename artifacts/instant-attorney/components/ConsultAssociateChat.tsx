"use client";

import { useEffect, useState } from "react";
import ReviewPartnerChat from "@/components/attorney-review/ReviewPartnerChat";
import { CONSULT_SHORTCUTS, type ConsultShortcutId } from "@/lib/consult-shortcuts";
import { mergeWrapUpPatch, normalizeWrapUp } from "@/lib/consult-wrap-up";
import type { ConsultWrapUp } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function ConsultAssociateChat({
  consultId,
  currentWrapUp,
  lockArtifacts,
  onWrapUp,
  onFeeDraft,
  onRefresh,
}: {
  consultId: string;
  currentWrapUp?: ConsultWrapUp | null;
  lockArtifacts?: boolean;
  onWrapUp?: (wrapUp: ConsultWrapUp) => void;
  onFeeDraft?: (draft: Record<string, unknown>) => void;
  onRefresh?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/attorney/consult/${consultId}/chat`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not load the associate thread.");
        if (!cancelled) {
          setMessages((data.messages ?? []).map((m: ChatMessage) => ({ role: m.role, content: m.content })));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the associate thread.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [consultId]);

  async function send(opts?: { text?: string; shortcut?: ConsultShortcutId }) {
    const shortcut = opts?.shortcut ? CONSULT_SHORTCUTS.find((item) => item.id === opts.shortcut) : undefined;
    const text = (opts?.text ?? shortcut?.instruction ?? input).trim();
    if (!text || sending) return;
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          currentWrapUp: currentWrapUp ?? null,
          shortcut: shortcut?.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The associate could not complete that turn.");
      setMessages([...nextMessages, { role: "assistant", content: data.message ?? "Done." }]);
      if (data.wrapUp) {
        const next = mergeWrapUpPatch(normalizeWrapUp(currentWrapUp), data.wrapUp);
        onWrapUp?.(next);
        if (!lockArtifacts) {
          void fetch(`/api/attorney/consult/${consultId}/wrap-up`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wrapUp: next }),
          });
        }
      }
      if (data.feeDraft && typeof data.feeDraft === "object" && !lockArtifacts) {
        onFeeDraft?.(data.feeDraft as Record<string, unknown>);
      }
      if (data.refreshWorkbench) onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The associate could not complete that turn.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ReviewPartnerChat
      messages={messages}
      input={input}
      sending={sending || loading}
      error={error ?? undefined}
      shortcuts={CONSULT_SHORTCUTS}
      emptyHint="Ask a question, talk through the call, or send a specialist. Closeout edits apply as you go. The client sees nothing until you send."
      subtitle="Edits land in the closeout draft as you talk. The client sees nothing until you send."
      onInput={setInput}
      onSend={() => void send()}
      onShortcut={(id) => void send({ shortcut: id as ConsultShortcutId })}
    />
  );
}
