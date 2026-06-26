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
- **The LIVE DB is behind on migrations and drifts from the `supabase/schema-stage*.sql` files** — the files are NOT a reliable picture of live state. Confirmed drift: `documents` stage2 RLS insert/update policies are NOT effective (a user-scoped insert/update of the caller's OWN row returns `42501`/0 rows), and stage8 columns (`parent_document_id`, `attorney_second_draft_prompt`) are MISSING. Always probe the live schema via the service-role REST API before trusting a migration file.
- **Document writes (and any write whose RLS policy may be missing) should go through `createServiceClient()` after the route authenticates the user AND verifies ownership** — this is the same client `BYPASS_AUTH` mode uses. `fact_items` user-scoped inserts DO work (its insert policy is effective); only `documents` writes were broken.
- **Service client bypasses RLS, so every query MUST carry explicit ownership predicates** (`.eq("user_id", userId)` and, where applicable, `.eq("case_file_id", caseFileId)`). A caller-supplied id (e.g. wizard `documentId`) filtered only by `.eq("id", ...)` is an IDOR — scope it or fall through to a fresh insert.

**Why:** before the streaming fix, generation always 502'd so the `documents` INSERT was never reached and the table stayed empty system-wide — masking the RLS drift and missing stage8 columns. Once generation worked, drafts generated but silently failed to persist (documentId null → client could never submit → the "0 documents / draft appears but nothing happens" symptom). The fix must NOT swallow persistence errors: fail fast (HTTP 500) rather than return 200 with documentId null.

**Unblocking submit:** to fully unblock the attorney-review/submit path the user must apply the missing migration (stage8: `parent_document_id`, `attorney_second_draft_prompt`) in the Supabase SQL editor — there is no DDL access from the workspace (no Postgres connection string, only Supabase REST). The service-client code fix only works around the RLS-policy drift, not the missing columns.

**How to apply:** when adding AI-call telemetry, merge a metadata object into the existing `recordAiFromMessage(...)` call rather than creating schema. Helpers that return a typed interface (e.g. `limitSignalMetadata`) must be **spread** into the `metadata: Record<string, unknown>` field (`metadata: { ...helper(...) }`) — assigning the typed object directly fails TS (missing index signature).
