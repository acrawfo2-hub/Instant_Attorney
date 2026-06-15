---
name: Anthropic batch API never completes on Replit
description: Why background AI work (auto-review, pre-warm) must stream inline rather than use messages.batches.
---

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
