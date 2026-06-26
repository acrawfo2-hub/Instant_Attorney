---
name: Long AI generations need client keep-alive streaming
description: Why attorney second-draft (and any multi-minute Anthropic route) must stream heartbeats to the browser, not just stream Anthropic->server.
---

Streaming from Anthropic to the server (`messages.stream().finalMessage()`) keeps the
SDK happy and avoids the "Streaming is required" rejection, but it does NOT keep the
**browser<->server** connection alive: the server sends zero bytes until the whole
generation finishes. For multi-minute work (e.g. the attorney second draft = Haiku
fitness + Opus draft) an intermediate proxy drops the idle connection and the browser
reports a generic "Network error", even with `maxDuration` raised.

**Rule:** any route whose total wall-clock can exceed ~30-60s must stream bytes to the
client throughout. Pattern used for second-draft: return a `ReadableStream` emitting
NDJSON — one heartbeat immediately, then every 10s, with a terminal line
`{type:"result"|"fitness_reject"|"error", ...}` as the last line. Headers:
`Content-Type: application/x-ndjson`, `Cache-Control: no-cache, no-transform`,
`X-Accel-Buffering: no`.

**Why:** wizard (single Sonnet call) finished fast enough to never hit this; the
Opus-based second draft did, so the same JSON-only pattern that worked for wizard
silently timed out here.

**How to apply:** pre-generation validation (auth/404/400) stays as normal JSON with
status codes; only the long generation moves into the stream. Client must read NDJSON,
skip heartbeats, parse the trailing line even if it lacks a final newline, and branch
on the terminal `type`. Note this moves former HTTP 422 (fitness reject) into a 200
streamed `fitness_reject` event — update the client contract accordingly.
