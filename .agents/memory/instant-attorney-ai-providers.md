---
name: Dual AI provider preference (Claude / Grok)
description: User-selectable workhorse provider; XAI_API_KEY + ZDR gates; resolveModel pattern.
---

Phase A added `profiles.preferred_ai_provider` (`anthropic` | `xai`) and
`lib/ai/*` (models resolver, clients, xAI stream). Living File intake
(`/api/chat-acp` text-only) honors Grok; freestyle/tools/attachments fall back
to Claude. See `artifacts/instant-attorney/docs/ai-provider-roadmap.md`.

Secrets: `XAI_API_KEY` in Vercel env + `.env.local`. Anthropic remains
`Claude_Instant_Attorney` (fallback `ANTHROPIC_API_KEY`). Production Grok offer
requires `XAI_ZDR_CONFIRMED` unless `XAI_PROVIDER_ENABLED=true`.
