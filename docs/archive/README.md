# Archive: `perf-phase1-phase2-6625`

This branch preserves the **phase 1 + phase 2 performance experiments** from session 6625. It is **not** intended to merge to `main`.

## Contents

- `961bcb0` — Phase 1: chat rendering, query projection, landing RSC
- `c955598` — Phase 2: conditional deep dives, history windowing, full living file

## Lookup guide

See [`docs/archive/perf-optimizations-6625.md`](https://github.com/acrawfo2-hub/instant-attorney/blob/main/docs/archive/perf-optimizations-6625.md) on `main` for a full summary, file list, and revisit checklist.

## Inspect locally

```bash
git diff main..archive/perf-phase1-phase2-6625
```

## Superseded by

Production prompt routing and token wins landed via `claude/token-efficiency-deep-dive-9fp57r` (merged to `main` 2026-06-27). The UI/RSC refactor from phase 1 was not merged.
