import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveModel, workhorseModelIdForProvider } from "./models.ts";

describe("resolveModel", () => {
  it("defaults workhorse to Anthropic Sonnet", () => {
    const m = resolveModel({ tier: "workhorse" });
    assert.equal(m.provider, "anthropic");
    assert.equal(m.modelId, "claude-sonnet-4-6");
    assert.equal(m.preference, "anthropic");
  });

  it("honors Grok preference for workhorse when xAI is configured", () => {
    const m = resolveModel({ tier: "workhorse", preference: "xai", xaiConfigured: true });
    assert.equal(m.provider, "xai");
    assert.equal(m.modelId, "grok-4.5");
    assert.equal(m.reason, "preference");
  });

  it("falls back to Anthropic when Grok is preferred but xAI is not configured", () => {
    const m = resolveModel({ tier: "workhorse", preference: "xai", xaiConfigured: false });
    assert.equal(m.provider, "anthropic");
    assert.equal(m.reason, "xai_unavailable");
  });

  it("falls back to Anthropic when Anthropic-only capabilities are required", () => {
    const m = resolveModel({
      tier: "workhorse",
      preference: "xai",
      xaiConfigured: true,
      requiresAnthropicCapabilities: true,
    });
    assert.equal(m.provider, "anthropic");
    assert.equal(m.reason, "capability_fallback_anthropic");
  });

  it("keeps cheap and premium tiers on Anthropic regardless of preference", () => {
    const cheap = resolveModel({ tier: "cheap", preference: "xai", xaiConfigured: true });
    const premium = resolveModel({ tier: "premium", preference: "xai", xaiConfigured: true });
    assert.equal(cheap.provider, "anthropic");
    assert.equal(cheap.reason, "tier_locked_anthropic");
    assert.equal(premium.provider, "anthropic");
    assert.equal(premium.modelId, "claude-opus-4-8");
  });
});

describe("workhorseModelIdForProvider", () => {
  it("maps providers to workhorse ids", () => {
    assert.equal(workhorseModelIdForProvider("anthropic"), "claude-sonnet-4-6");
    assert.equal(workhorseModelIdForProvider("xai"), "grok-4.5");
  });
});
