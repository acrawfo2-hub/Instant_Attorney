---
name: Anthropic SDK "Streaming is required" on large max_tokens
description: Why high-max_tokens non-streaming Anthropic calls throw, and the proxy-safe fix
---

# Anthropic SDK refuses non-streaming calls with large max_tokens

**Symptom:** A synchronous `anthropic.messages.create({ ..., max_tokens: <large> })`
throws **before the API call** with: `Streaming is required for operations that may
take longer than 10 minutes.` In a route, this surfaces as a 502 on *every* call.

**Cause:** The SDK estimates the request could exceed its 10-minute non-streaming
ceiling when `max_tokens` is large, and hard-refuses. In Instant-Attorney the full
document ceiling is 64000 (`maxOutputTokensFor` in `lib/token-limits.ts`), which
trips this every time.

**Fix (proxy-safe):** Use streaming consumed server-side, then assemble:
`const stream = anthropic.messages.stream({...}); const message = await stream.finalMessage();`
`finalMessage()` returns a full `Anthropic.Message` (so `stop_reason`, `usage`,
content blocks, truncation detection, and `recordAiFromMessage` all still work).
Return the assembled text as a single JSON payload — do NOT pipe SSE through the
Replit proxy to the browser (that proxy silently drops streamed responses; that is
why these routes were non-streaming in the first place).

**Why:** streaming requests have no 10-min guard; consuming the stream on the
server keeps the client contract a normal JSON response = both constraints satisfied.

**How to apply:** Any sync `messages.create()` with a high `max_tokens` (32k–64k)
carries this same latent failure — audit every call site, not just the obvious
routes. Batch-API calls (`messages.batches.create`) are exempt — they are async by
design (used by pre-warm.ts and document-utils auto-review).

**Data-loss corollary:** a background processor whose top-level `catch` *deletes the
user's input* (e.g. attachment-processor removing the uploaded file) turns this latent
throw into silent data loss. Failure paths for AI analysis must preserve the user's
upload (mark it ready without analysis), and truncation (`stop_reason === "max_tokens"`)
must be treated as a valid partial result — persist the best-effort output rather than
deleting/retrying the job.
