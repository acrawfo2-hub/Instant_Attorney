---
name: Anthropic batch API never completes on Replit; pre-warm is retired
description: Why background AI work must stream inline rather than use messages.batches, and why pre-warm must never be re-added.
---

**Pre-warm (background pre-generation of a draft before the client opens the
wizard) is permanently retired — do NOT re-add it.** It was brittle on an
ephemeral server (severed background jobs left `documents` rows stranded at
status `pre_warmed` with null `draft_text`) and the live "compose on open +
answer starter questions in parallel" flow makes it unnecessary. The cleanup
migration is `supabase/schema-stage13-retire-prewarm.sql`. The `pre_warmed`
DocumentStatus is intentionally kept ONLY for backward-compat with legacy rows.
If a future plan/session note asks to "re-add pre-warm" or "fix pre-warm to
save," treat it as stale and skip it.

**Why:** retiring it was a deliberate decision; resurrecting it reintroduces the
stranded-row bug and contradicts the on-demand draft flow.

Any Anthropic `messages.batches.create` work in Instant-Attorney gets stuck forever.

**Why:** batch results are only retrievable by polling, and the only poller
(`app/api/batches/poll`) was wired to a Vercel cron (`vercel.json`) that does not
run on Replit. So batched docs sat at `review_status="reviewing"` (or pre_warm with
null draft) permanently — the "AI reviewing…" badge that never resolves.

**How to apply:** generate background AI inline with
`anthropic.messages.stream(...).finalMessage()` (streaming is required at the large
max_tokens ceiling, see anthropic-streaming-required.md), persist the result, and
flip status in the same fire-and-forget call. This runs in the long-lived Next
process. `/api/batches/poll` + `vercel.json` are now dead code; do NOT add
`/api/batches` to artifact.toml paths — the route is unauthenticated unless
`CRON_SECRET` is set, so owning the path would expose it.
