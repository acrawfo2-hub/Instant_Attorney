import { test, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Unit tests for the pure completion-grace math in lib/topup.ts (evaluateGrace).
//
// topup.ts transitively imports @/lib/supabase/server (→ next/headers) and
// @/lib/stripe, neither of which resolves under plain `node --test`. We only
// need the pure, IO-free evaluateGrace export, so we stub those modules to no-op
// shells before dynamically importing topup — mirroring lib/wizard-route.test.ts.

const ROOT = process.cwd();
const libUrl = (name: string) => pathToFileURL(path.join(ROOT, "lib", name)).href;

mock.module(libUrl("supabase/server.ts"), {
  namedExports: {
    createClient: async () => ({}),
    createServiceClient: () => ({}),
  },
});
mock.module(libUrl("stripe.ts"), {
  namedExports: { getStripe: () => ({}) },
});

const { evaluateGrace } = await import(libUrl("topup.ts"));

// ── Opt-out: grace never allows a blocked call ───────────────────────────────
test("opted-out customer is never granted grace", () => {
  const d = evaluateGrace({ optIn: false, meterUsd: 5, anchorUsd: 5, bufferUsd: 8.5 });
  assert.equal(d.allowed, false);
  assert.equal(d.graceRemainingUsd, 8.5);
});

// ── Opt-in, fresh block: full buffer available ───────────────────────────────
test("opted-in customer at the anchor has the full buffer and is allowed", () => {
  const d = evaluateGrace({ optIn: true, meterUsd: 4.75, anchorUsd: 4.75, bufferUsd: 8.5 });
  assert.equal(d.allowed, true);
  assert.equal(d.graceUsedUsd, 0);
  assert.equal(d.graceRemainingUsd, 8.5);
});

// ── Opt-in, partway through the buffer: still allowed, remaining shrinks ──────
test("partial grace consumption stays allowed with reduced remaining", () => {
  // Meter moved $3 past the anchor on an $8.50 buffer.
  const d = evaluateGrace({ optIn: true, meterUsd: 7.75, anchorUsd: 4.75, bufferUsd: 8.5 });
  assert.equal(d.allowed, true);
  assert.equal(d.graceUsedUsd, 3);
  assert.equal(d.graceRemainingUsd, 5.5);
});

// ── Opt-in, buffer exhausted: hard stop ──────────────────────────────────────
test("grace is denied once consumption reaches the buffer", () => {
  // Exactly at the buffer — boundary is exclusive, so this is the hard stop.
  const atCap = evaluateGrace({ optIn: true, meterUsd: 13.25, anchorUsd: 4.75, bufferUsd: 8.5 });
  assert.equal(atCap.allowed, false);
  assert.equal(atCap.graceRemainingUsd, 0);

  const past = evaluateGrace({ optIn: true, meterUsd: 20, anchorUsd: 4.75, bufferUsd: 8.5 });
  assert.equal(past.allowed, false);
  assert.equal(past.graceRemainingUsd, 0);
});

// ── Null anchor: measured from the current meter (zero consumed) ─────────────
test("a null anchor measures grace from the current meter", () => {
  const d = evaluateGrace({ optIn: true, meterUsd: 9, anchorUsd: null, bufferUsd: 8.5 });
  assert.equal(d.allowed, true);
  assert.equal(d.graceUsedUsd, 0);
  assert.equal(d.graceRemainingUsd, 8.5);
});

// ── Exposure is bounded by the buffer regardless of how far the meter ran ─────
test("remaining never goes negative even when meter overshoots the buffer", () => {
  const d = evaluateGrace({ optIn: true, meterUsd: 100, anchorUsd: 4.75, bufferUsd: 8.5 });
  assert.equal(d.allowed, false);
  assert.equal(d.graceRemainingUsd, 0);
  assert.ok(d.graceUsedUsd > 8.5);
});
