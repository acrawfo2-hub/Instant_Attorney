"use client";

import { memo } from "react";
import type { IntakeMessage } from "@/lib/types";
import { renderChatContent } from "./chat-content";

export type ChatMsg = Pick<IntakeMessage, "role" | "content"> & {
  id: string;
  imageUrl?: string;
};

interface ChatMessageBubbleProps {
  msg: ChatMsg;
}

function ChatMessageBubbleInner({ msg }: ChatMessageBubbleProps) {
  return (
    <div className={msg.role === "user" ? "fc-msg-row fc-msg-row-user" : "fc-msg-row fc-msg-row-ai"}>
      {msg.role === "assistant" && (
        <div className="fc-avatar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
      )}
      <div className={msg.role === "user" ? "fc-bubble fc-bubble-user" : "fc-bubble fc-bubble-ai"}>
        {msg.role === "assistant" ? (
          renderChatContent(msg.content)
        ) : msg.imageUrl ? (
          <>
            <img src={msg.imageUrl} alt="attached screenshot" className="fc-bubble-image" />
            {(() => {
              const caption = msg.content.replace(/^\[[^\]]*\]\s*/, "");
              return caption ? <p>{caption}</p> : null;
            })()}
          </>
        ) : (
          <p>{msg.content}</p>
        )}
      </div>
    </div>
  );
}

const ChatMessageBubble = memo(ChatMessageBubbleInner);
export default ChatMessageBubble;
