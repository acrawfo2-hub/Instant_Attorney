---
name: Strength Check (adversarial stress test)
description: Client-facing "How strong is my position?" — storage in legal_strategy JSONB, concurrency rule, chat parity via the stress_test_position tool.
---

- The check is stored at `case_files.legal_strategy.strength_check` (JSONB, no migration). Two rules keep it alive:
  - `lib/file-parser.ts` must carry `strength_check` forward whenever the extractor rewrites the strategy block (the extractor builds a fresh object — any new key stored inside legal_strategy needs the same carry-forward).
  - Writes go through `saveStrengthCheck` (lib/strength-check-store.ts): re-read strategy right before writing, guard the update on the row's `updated_at`, retry on lost races, THROW on failure. **Why:** legal_strategy is whole-column-written by several writers and the analysis takes minutes; a stale spread silently reverts concurrent strategy rewrites, and a swallowed save error breaks file/chat parity.
- Chat parity: orchestrator tool `stress_test_position` returns the STORED check by default and only re-runs with refresh=true; it's in WRITE_TOOL_NAMES so the read-only attorney associate can't trigger paid runs.
- Store/persistence code lives in a file with only relative imports so node:test can load it (path-alias limitation).
- New usage features must be added to the UsageFeature union in lib/usage-tracker.ts or tsc fails.
