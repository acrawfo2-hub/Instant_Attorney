# Archived: Performance optimizations (phase 1 + 2) — session 6625

**Status:** Archived — not merged to `main`.  
**Archive branch:** `archive/perf-phase1-phase2-6625`  
**Draft PRs (closed, not merged):** #59 (`cursor/phase1-perf-optimizations-6625`), #60 (`cursor/phase2-ai-context-6625`)

These experiments were superseded for production. The **token-efficiency** work in PR #61 (`claude/token-efficiency-deep-dive-9fp57r`) was merged instead for prompt modularization and chat hot-path wins, without the heavier UI refactor from phase 1.

## Why archived

Phase 1 and 2 bundled large client/server splits (ACP chat client extraction, landing RSC conversion, server-side history loading, 30-turn chat windowing) alongside prompt changes. That combination was risky to land in one push. We kept the ideas documented here and on the archive branch for reference.

## Phase 1 — `961bcb0` (chat rendering, query projection, landing RSC)

| Area | What it tried |
|------|----------------|
| Chat UI | Extract `AcpChatClient.tsx`; memoized `ChatMessageBubble` / `StreamingBubble`; rAF-throttled streaming |
| Handoff polling | Poll `legal_strategy` only after stream ends or on resume, not on every message |
| Dashboard | Column projection on file detail — omit `content_json` and review blobs |
| Account menu | Pass profile from server to `AccountMenu` on chat and file detail pages |
| Landing | Convert `app/page.tsx` to a server component using `Link` instead of client router |

**Files touched:** `app/chat/AcpChatClient.tsx`, `app/chat/page.tsx`, `app/dashboard/[id]/page.tsx`, `app/page.tsx`, `components/chat/*`, `lib/file-detail-selects.ts`

## Phase 2 — `c955598` (conditional deep dives, history windowing)

| Area | What it tried |
|------|----------------|
| Prompts | Split ACP system prompt into core + on-demand practice-area deep dives via `acp-matter-areas.ts` / `acp-practice-prompts.ts` |
| Chat API | Server loads history from DB; client sends `userMessage` only |
| History window | Soft cap at 30 turns with user notice; living file never truncated |
| Caching | Anthropic prompt caching on core/tail and practice blocks |
| Observability | Usage metadata for windowing, practice areas, living file size |

**Files touched:** `app/api/chat-acp/route.ts`, `lib/acp-matter-areas.ts`, `lib/acp-practice-prompts.ts`, `lib/chat-history.ts`, `lib/prompts.ts`

## What landed on `main` instead (2026-06-27)

Merged from other branches in one integration PR:

- **Texas lien knowledge base** — PR #57
- **Existing-counsel intake** — PR #58
- **Attorney⇆client messaging + document comments** — PR #56 (migrations renumbered: stage 29 = counsel, 30 = comments, 31 = messages)
- **Token efficiency + conditional deep dives** — PR #61 (`acp-area-router.ts`, prompt caching on free chat, concurrent ACP DB gates, lien as `ACP_MOD_LIEN`)

## How to inspect the archived code

```bash
git fetch origin archive/perf-phase1-phase2-6625
git checkout archive/perf-phase1-phase2-6625
# or diff against main:
git diff main..archive/perf-phase1-phase2-6625
```

## Revisit checklist (if picking this up later)

1. Phase 1 UI split — validate streaming UX and legal-strategy handoff before re-landing.
2. Phase 2 history windowing — confirm attorney review and living-file sync still work with truncated replay.
3. Prefer incremental PRs: UI perf separate from prompt/token routing.
4. Compare with `lib/acp-area-router.ts` on `main` — do not duplicate `acp-matter-areas.ts` without reconciling.
