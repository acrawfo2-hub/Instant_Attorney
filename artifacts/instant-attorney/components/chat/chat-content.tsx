import type { ReactNode } from "react";

function inlineBold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

/** Renders assistant markdown-ish blocks (living file, urgent, lists). */
export function renderChatContent(text: string) {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line === "---LIVING FILE---") {
      const blockLines: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== "---END FILE---") {
        blockLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={`lf-${i}`} className="chat-lf-block">
          <div className="chat-lf-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Living File Updated
          </div>
          <div className="chat-lf-body">
            {blockLines.map((l, j) => {
              if (l.match(/^[A-Z ]+:$/)) return <p key={j} className="chat-lf-section">{l}</p>;
              if (l.startsWith("•")) return <p key={j} className="chat-lf-item">· {l.slice(1).trim()}</p>;
              return <p key={j} className="chat-lf-line">{l}</p>;
            })}
          </div>
        </div>
      );
    } else if (line.startsWith("[URGENT:") || line.startsWith("[URGENT]")) {
      elements.push(
        <div key={i} className="chat-urgent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{line.replace(/^\[URGENT:?\]\s*/, "")}</span>
        </div>
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="fc-msg-list">
          {items.map((item, j) => <li key={j}>{inlineBold(item)}</li>)}
        </ul>
      );
      continue;
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="fc-spacer" />);
    } else {
      elements.push(<p key={i}>{inlineBold(line)}</p>);
    }
    i++;
  }

  return elements;
}
