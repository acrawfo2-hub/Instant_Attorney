"use client";

import { TOOL_LABELS } from "@/lib/tool-markers";

// Transient "running…" chips for orchestrator tools in flight. Shared by the
// consumer and attorney chats.
export default function ToolRunChips({ tools }: { tools: string[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="fc-tool-chips">
      {tools.map((t) => (
        <span key={t} className="fc-tool-chip">
          <span className="fc-tool-chip-spinner" aria-hidden />
          {(TOOL_LABELS[t] ?? "Working")}…
        </span>
      ))}
    </div>
  );
}
