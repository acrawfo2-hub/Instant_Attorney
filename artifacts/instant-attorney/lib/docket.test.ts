import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDocket,
  describePressingDeadline,
  formatDocketForPrompt,
  urgencyFromDays,
} from "./docket.ts";

const NOW = new Date("2026-08-08T12:00:00Z");

test("served_lawsuit computes Texas answer date (Monday next after 20 days)", () => {
  // Served 2026-07-20 (Mon). +20 days = 2026-08-09 (Sun). Monday next after = 2026-08-10.
  const entries = computeDocket(
    [{ id: "f1", description: "Key date · served_lawsuit · 2026-07-20 — served with citation at home", status: "confirmed" }],
    NOW
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].deadlineDate, "2026-08-10");
  assert.equal(entries[0].urgency, "critical");
  assert.equal(entries[0].daysRemaining, 2);
});

test("answer date lands strictly after a Monday 20th day", () => {
  // Served 2026-07-13 (Mon). +20 = 2026-08-02 (Sun)? Actually 2026-08-02 is a Sunday.
  // Use a service date where day 20 IS a Monday: served 2026-07-14 (Tue) → +20 = 2026-08-03 (Mon).
  // "Monday next after" a Monday must be the FOLLOWING Monday (2026-08-10).
  const entries = computeDocket(
    [{ description: "Key date · served_lawsuit · 2026-07-14 — served", status: "confirmed" }],
    NOW
  );
  assert.equal(entries[0].deadlineDate, "2026-08-10");
});

test("incident_injury computes 2-year PI deadline", () => {
  const entries = computeDocket(
    [{ description: "Key date · incident_injury · 2025-03-01 — rear-ended on I-35", status: "confirmed" }],
    NOW
  );
  assert.equal(entries[0].deadlineDate, "2027-03-01");
  assert.equal(entries[0].urgency, "normal");
});

test("publication computes 1-year defamation deadline; expired when past", () => {
  const entries = computeDocket(
    [{ description: "Key date · publication · 2025-06-01 — false review posted", status: "confirmed" }],
    NOW
  );
  assert.equal(entries[0].deadlineDate, "2026-06-01");
  assert.equal(entries[0].urgency, "expired");
  assert.ok(entries[0].daysRemaining < 0);
});

test("termination yields BOTH the EEOC (300d) and TWC (180d) deadlines", () => {
  const entries = computeDocket(
    [{ description: "Key date · termination · 2026-05-01 — fired after reporting harassment", status: "confirmed" }],
    NOW
  );
  assert.equal(entries.length, 2);
  const labels = entries.map((e) => e.label).join(" | ");
  assert.match(labels, /EEOC/);
  assert.match(labels, /Texas Workforce/);
  // TWC (180d → 2026-10-28) sorts before EEOC (300d → 2027-02-25) — fewer days left.
  assert.ok(entries[0].daysRemaining < entries[1].daysRemaining);
});

test("explicit_deadline event and prose fallback both docket a literal date, deduped", () => {
  const entries = computeDocket(
    [
      { description: "Key date · explicit_deadline · 2026-09-01 — HOA cure deadline from demand letter", status: "confirmed" },
      { description: "The demand letter says we must file by 2026-09-01 or lose the right.", status: "confirmed" },
    ],
    NOW
  );
  // Same date → one entry (deduped by explicit:<date>).
  assert.equal(entries.filter((e) => e.deadlineDate === "2026-09-01").length, 1);
});

test("gap and hypothetical facts are ignored", () => {
  const entries = computeDocket(
    [
      { description: "Key date · publication · 2026-01-01 — hypothetical scenario", status: "confirmed", kind: "hypothetical" },
      { description: "What-if · Key date · incident_injury · 2026-01-01 — imagined crash", status: "confirmed" },
      { description: "Key date · termination · 2026-01-01 — unclear", status: "gap" },
    ],
    NOW
  );
  assert.equal(entries.length, 0);
});

test("unknown events and malformed dates are skipped without throwing", () => {
  const entries = computeDocket(
    [
      { description: "Key date · alien_abduction · 2026-01-01 — n/a", status: "confirmed" },
      { description: "Key date · publication · 2026-13-45 — bad date", status: "confirmed" },
    ],
    NOW
  );
  assert.equal(entries.length, 0);
});

test("confirmed non-Texas jurisdiction suppresses Texas rules but keeps federal + explicit", () => {
  const facts = [
    { description: "Key date · served_lawsuit · 2026-07-20 — served", status: "confirmed" },
    { description: "Key date · incident_injury · 2026-01-01 — crash", status: "confirmed" },
    { description: "Key date · collector_notice · 2026-08-01 — first collection letter", status: "confirmed" },
    { description: "Key date · explicit_deadline · 2026-09-15 — response due per court order", status: "confirmed" },
  ];
  const ca = computeDocket(facts, NOW, "California");
  const events = ca.map((e) => e.event).sort();
  assert.deepEqual(events, ["collector_notice", "explicit_deadline"]);

  // Texas / unset / unconfirmed all apply the full rule set.
  for (const j of ["Texas", "TX", undefined, null, "Unconfirmed — defaulting to Texas"]) {
    const all = computeDocket(facts, NOW, j as string | null | undefined);
    assert.ok(all.some((e) => e.event === "served_lawsuit"), `served_lawsuit expected for ${j}`);
  }
});

test("impossible calendar dates (2026-02-30) are rejected, not JS-normalized", () => {
  const entries = computeDocket(
    [{ description: "Key date · publication · 2026-02-30 — bad date", status: "confirmed" }],
    NOW
  );
  assert.equal(entries.length, 0);
});

test("sorted most-pressing first across urgencies", () => {
  const entries = computeDocket(
    [
      { description: "Key date · incident_injury · 2026-08-01 — recent crash", status: "confirmed" }, // 2028-08-01, normal
      { description: "Key date · publication · 2025-07-01 — post", status: "confirmed" }, // 2026-07-01, expired
      { description: "Key date · served_lawsuit · 2026-08-01 — served", status: "confirmed" }, // critical
    ],
    NOW
  );
  assert.equal(entries[0].urgency, "expired");
  assert.equal(entries[1].urgency, "critical");
  assert.equal(entries[entries.length - 1].urgency, "normal");
});

test("urgencyFromDays thresholds", () => {
  assert.equal(urgencyFromDays(-1), "expired");
  assert.equal(urgencyFromDays(0), "critical");
  assert.equal(urgencyFromDays(60), "critical");
  assert.equal(urgencyFromDays(61), "warning");
  assert.equal(urgencyFromDays(180), "warning");
  assert.equal(urgencyFromDays(181), "normal");
});

test("describePressingDeadline: null for normal, phrased for critical/expired", () => {
  const normal = computeDocket(
    [{ description: "Key date · incident_injury · 2026-08-01 — crash", status: "confirmed" }],
    NOW
  );
  assert.equal(describePressingDeadline(normal), null);

  const critical = computeDocket(
    [{ description: "Key date · served_lawsuit · 2026-08-01 — served", status: "confirmed" }],
    NOW
  );
  assert.match(describePressingDeadline(critical) ?? "", /Heads up/);

  const expired = computeDocket(
    [{ description: "Key date · publication · 2025-01-01 — post", status: "confirmed" }],
    NOW
  );
  assert.match(describePressingDeadline(expired) ?? "", /passed/);
});

test("formatDocketForPrompt emits a compact block with urgency tags", () => {
  const entries = computeDocket(
    [{ description: "Key date · served_lawsuit · 2026-08-01 — served", status: "confirmed" }],
    NOW
  );
  const block = formatDocketForPrompt(entries).join("\n");
  assert.match(block, /KEY DEADLINES/);
  assert.match(block, /\[CRITICAL\]/);
  assert.equal(formatDocketForPrompt([]).length, 0);
});
