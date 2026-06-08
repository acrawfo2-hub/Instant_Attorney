"use client";

import { useState, useRef, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WIZARD_LABELS } from "@/lib/types";
import type { WizardType } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function parseWizardComplete(text: string): Record<string, string> | null {
  const match = text.match(/---WIZARD COMPLETE---([\s\S]*?)---END WIZARD---/);
  if (!match) return null;

  const data: Record<string, string> = {};
  const lines = match[1].trim().split("\n");
  let currentKey = "";
  let currentVal: string[] = [];

  for (const line of lines) {
    const kv = line.match(/^([A-Z_]+):\s*(.*)$/);
    if (kv) {
      if (currentKey) data[currentKey.toLowerCase()] = currentVal.join("\n").trim();
      currentKey = kv[1];
      currentVal = [kv[2]];
    } else if (currentKey) {
      currentVal.push(line);
    }
  }
  if (currentKey) data[currentKey.toLowerCase()] = currentVal.join("\n").trim();
  return data;
}

export default function WizardPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseFileId = searchParams.get("caseFileId") ?? "";

  const wizardType = type as WizardType;
  const label = WIZARD_LABELS[wizardType] ?? wizardType;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [wizardData, setWizardData] = useState<Record<string, string> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Start the wizard on mount
  useEffect(() => {
    sendMessage("", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(userText: string, isInit = false) {
    if (streaming || generating) return;

    const outgoing: Message[] = isInit
      ? []
      : [...messages, { role: "user", content: userText }];

    if (!isInit) {
      setMessages(outgoing);
      setInput("");
    }

    setStreaming(true);
    setError("");

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...(isInit ? [] : outgoing), assistantMsg]);

    try {
      const res = await fetch("/api/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: isInit ? [{ role: "user", content: "__init__" }] : outgoing,
          caseFileId,
          wizardType,
        }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      if (!res.body) throw new Error("No body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullText += chunk;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: fullText };
          return next;
        });
      }

      // Check for wizard completion signal
      const completed = parseWizardComplete(fullText);
      if (completed) {
        setWizardData(completed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection error");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  async function handleGenerate() {
    if (!wizardData || generating) return;
    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseFileId,
          wizardType,
          wizardData,
          title: `${label} — ${new Date().toLocaleDateString()}`,
        }),
      });

      if (!res.ok) throw new Error(`Generation failed: ${res.status}`);

      // Download the .docx
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${label.replace(/\s+/g, "_")}.docx`;
      a.click();
      URL.revokeObjectURL(url);

      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function renderMessage(msg: Message, i: number) {
    const isUser = msg.role === "user";
    const isInit = isUser && msg.content === "__init__";
    if (isInit) return null;

    const isComplete = msg.content.includes("---WIZARD COMPLETE---");
    const displayContent = isComplete
      ? msg.content.replace(/---WIZARD COMPLETE---[\s\S]*?---END WIZARD---/, "").trim()
      : msg.content;

    return (
      <div key={i} className={`wiz-msg ${isUser ? "wiz-msg-user" : "wiz-msg-ai"}`}>
        {!isUser && <div className="wiz-msg-label">Intake Wizard</div>}
        <div className="wiz-msg-bubble">
          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(displayContent) }} />
          {!isUser && i === messages.length - 1 && streaming && (
            <span className="wiz-cursor" aria-hidden />
          )}
        </div>
        {isComplete && !isUser && (
          <div className="wiz-complete-badge">Wizard complete — ready to generate document</div>
        )}
      </div>
    );
  }

  return (
    <div className="wiz-shell">
      <div className="wiz-header">
        <button className="wiz-back" onClick={() => router.push("/dashboard")}>← Back to File</button>
        <div className="wiz-title">
          <span className="wiz-type-pill">{label}</span>
          <span className="wiz-acp-badge">ACP Protected</span>
        </div>
      </div>

      <div className="wiz-chat">
        {messages.map((m, i) => renderMessage(m, i))}
        {streaming && messages.length === 0 && (
          <div className="wiz-thinking">
            <span /><span /><span />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="wiz-error">{error}</div>}

      {wizardData && !generated && (
        <div className="wiz-generate-bar">
          <p className="wiz-generate-hint">All required information has been gathered. Generate your document for attorney review.</p>
          <button
            className="wiz-generate-btn"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? "Generating…" : `Generate ${label} →`}
          </button>
        </div>
      )}

      {generated && (
        <div className="wiz-done-bar">
          <p>Your document has been sent for attorney review (48 hours). You can continue the conversation or return to your file.</p>
          <button className="wiz-back-btn" onClick={() => router.push("/dashboard")}>
            View Your File →
          </button>
        </div>
      )}

      {!wizardData && !generated && (
        <form
          className="wiz-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) sendMessage(input.trim());
          }}
        >
          <textarea
            ref={inputRef}
            className="wiz-input"
            placeholder="Your response…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            disabled={streaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) sendMessage(input.trim());
              }
            }}
          />
          <button type="submit" className="wiz-send" disabled={streaming || !input.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^\s*[-•]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
}
