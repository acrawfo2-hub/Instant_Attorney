import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { windowChatHistory, toChatTurns, CHAT_RECENT_MESSAGE_LIMIT } from "./chat-history.ts";

describe("windowChatHistory", () => {
  it("returns all messages when under the limit", () => {
    const msgs = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `m${i}`,
    }));
    const result = windowChatHistory(msgs);
    assert.equal(result.windowed, false);
    assert.equal(result.messages.length, 5);
  });

  it("trims with a notice when over the limit — never throws", () => {
    const msgs = Array.from({ length: CHAT_RECENT_MESSAGE_LIMIT + 10 }, (_, i) => ({
      role: "user" as const,
      content: `msg-${i}`,
    }));
    const result = windowChatHistory(msgs);
    assert.equal(result.windowed, true);
    assert.equal(result.droppedCount, 10);
    assert.equal(result.messages.length, CHAT_RECENT_MESSAGE_LIMIT + 1);
    assert.match(result.messages[0].content, /omitted from chat context/);
    assert.equal(result.messages.at(-1)?.content, `msg-${CHAT_RECENT_MESSAGE_LIMIT + 9}`);
  });
});

describe("toChatTurns", () => {
  it("filters to user/assistant roles only", () => {
    const turns = toChatTurns([
      { role: "user", content: "hi" },
      { role: "system", content: "ignore" },
      { role: "assistant", content: "hello" },
    ]);
    assert.deepEqual(turns, [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });
});
