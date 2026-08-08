---
name: Deadline docketing engine
description: How computed case deadlines work — canonical "Key date · <event> · YYYY-MM-DD" facts, jurisdiction gating, and the extractor contract.
---

The docket (lib/docket.ts, pure/client-safe) computes deadlines deterministically from facts, not the model.

- **Fact contract:** the Living File extractor emits `Key date · <event> · YYYY-MM-DD — desc` as ordinary confirmed facts (same prefix-tag pattern as "What-if · "; no DB migration). Allowed event tokens live in DOCKET_EVENTS; unknown tokens are silently skipped, so prompt drift = silently missing deadlines.
- **Jurisdiction gating:** Texas-scoped rules apply only when jurisdiction is Texas/unset/unconfirmed (`texasRulesApply`). Confirmed other states get explicit + federal rules only — never show a Texas period to a non-Texas file.
- **Why:** the code-review architect flagged that unguarded Texas rules on Local Counsel Prep files produce legally wrong dates — worse than no date.
- **How to apply:** any new rule must declare `scope: "texas" | "federal"`; any new caller of computeDocket must pass the case file's jurisdiction. Day counts use America/Chicago calendar days (calendarToday), not UTC-midnight diffs. ISO dates are strict round-trip validated (2026-02-30 rejected).
- The extractor's user message includes a `TODAY'S DATE:` line so relative dates resolve deterministically; without it the prompt says record a FACT GAP instead of guessing.
- matter-tasks deadlineTasks delegates to computeDocket; explicit-deadline facts keep the historical `deadline:<factId>` task id.
