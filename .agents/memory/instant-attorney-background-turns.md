---
name: Background chat turns (chat-acp jobs)
description: How long chat generations run detached from the browser and how the client re-attaches; constraints to preserve.
---

Chat turns run as detached in-process jobs (lib/acp-jobs.ts, globalThis registry; single-instance server). The /api/chat-acp response stream is only a relay — generation + ALL persistence run to completion even if the browser disconnects.

Rules:
- The stream header frame is `\x00<caseFileId>|<jobId>\x00` — the client parses both; don't revert to caseFileId-only.
- `finishAcpJob` must be unbypassable (outer finally around post-stream persistence). A job that never finishes makes later turns wait on it and clients poll forever; there's also a 10-min Promise.race timeout on waiting for a predecessor.
- Sending mid-generation: client aborts its fetch (server keeps going), leaves a hidden placeholder Msg (`pendingId`) as a stable transcript anchor, and polls /api/chat-acp/status. Never use array indexes as insertion anchors — they shift.
- The client refuses to background a turn whose job id hasn't arrived yet (header not read) — otherwise the turn is unrecoverable.
- Server serializes turns per case file: a new request heartbeats `\x02TOOL:previous_turn:running\x02` every 8s while awaiting the predecessor (proxy keep-alive), then splices its reply into the model history before the new user message.
- Scroll: auto-scroll only when pinned to bottom (pinnedRef); "Jump to latest" button is conditional on activity and unmounts when idle — automated tests clicking it will flake by design.
- Status endpoint auth: returns job only if job.userId matches; jobs TTL 15 min after finish, 30 min stale-running cutoff.
