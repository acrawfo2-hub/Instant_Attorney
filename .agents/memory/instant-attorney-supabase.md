---
name: Instant-Attorney Supabase & AI telemetry
description: How the legal-intake app persists data and AI usage telemetry, and how schema changes are applied.
---

# Instant-Attorney data & telemetry

- The app talks to **Supabase directly** (NOT Drizzle, despite the repo's default API-server stack). No migration runner and no direct Postgres connection.
- **Schema changes are applied MANUALLY** by pasting `supabase/schema-stage*.sql` into the Supabase SQL editor. Do not expect a `db push` to touch this app's tables.
- `usage_events` already records every **authenticated** AI call (model, output_tokens, feature, `metadata` jsonb) and has an `attorneys_read_all_usage_events` RLS policy. Prefer piggy-backing new per-call signals into the `metadata` jsonb over adding tables/DDL.
- Anonymous routes (e.g. `free_chat`) have no `user_id`, so they CANNOT write `usage_events` — keep them log-only.
- Anthropic API key is `process.env.Claude_Instant_Attorney` (unusual capitalized name; not in the listed Replit secrets but works in prod).

**Why:** avoids inventing migrations the project has no tooling for, and avoids breaking the manual-SQL workflow.

**How to apply:** when adding AI-call telemetry, merge a metadata object into the existing `recordAiFromMessage(...)` call rather than creating schema. Helpers that return a typed interface (e.g. `limitSignalMetadata`) must be **spread** into the `metadata: Record<string, unknown>` field (`metadata: { ...helper(...) }`) — assigning the typed object directly fails TS (missing index signature).
