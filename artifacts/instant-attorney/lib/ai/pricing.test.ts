import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeAiCostUsd } from "./pricing.ts";

describe("computeAiCostUsd", () => {
  it("prices Sonnet with Anthropic cache multipliers", () => {
    const cost = computeAiCostUsd("claude-sonnet-4-6", 1_000_000, 1_000_000, 1, 1_000_000, 1_000_000);
    // input 3 + output 15 + cacheWrite 3*1.25 + cacheRead 3*0.1 = 22.05
    assert.equal(cost, 22.05);
  });

  it("prices Grok with xAI cached-input rate (non-double-count)", () => {
    const cost = computeAiCostUsd("grok-4.5", 1_000_000, 500_000, 1, 0, 200_000);
    // nonCached 800k * $2 + cached 200k * $0.3 + output 500k * $6 = 4.66
    assert.equal(cost, 4.66);
  });
});
