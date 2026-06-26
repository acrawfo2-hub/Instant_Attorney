"use client";

import { memo } from "react";
import { renderChatContent } from "./chat-content";

interface StreamingBubbleProps {
  text: string;
}

function StreamingBubbleInner({ text }: StreamingBubbleProps) {
  return (
    <div className="fc-msg-row fc-msg-row-ai">
      <div className="fc-avatar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>
      <div className="fc-bubble fc-bubble-ai fc-bubble-streaming">
        {renderChatContent(text)}
        <span className="fc-cursor" />
      </div>
    </div>
  );
}

const StreamingBubble = memo(StreamingBubbleInner);
export default StreamingBubble;
