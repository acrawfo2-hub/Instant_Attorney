---
name: Instant-Attorney artifact routing & build isolation
description: Why instant-attorney uses npm (not pnpm) and how proxy path-ownership can silently shadow new API routes
---

# Instant-Attorney is npm-isolated and shares /api with the Express api-server

**Build isolation:** instant-attorney is deliberately EXCLUDED from the pnpm
workspace (`pnpm-workspace.yaml` packages glob is `artifacts/!(instant-attorney)`).
It is a standalone npm project with its own committed `package-lock.json`, run via
`npm run dev`. Consequences:
- Root `pnpm run typecheck` / `pnpm -r` do NOT cover it. Check it with `npm run
  typecheck` / `npm test` from `artifacts/instant-attorney`, not pnpm `--filter`
  (the filter matches nothing → "No projects matched").
- It cannot import `@workspace/*` libs; it's fully self-contained under `@/`.

**Routing gotcha (cost a wrong turn):** the reverse proxy matches most-specific
path first. The api-server artifact owns `/api` (Express), so any `/api/<x>` path
NOT explicitly listed in instant-attorney's `.replit-artifact/artifact.toml`
`paths` array falls through to the Express api-server. Example: a new
`app/api/healthz/route.ts` in instant-attorney is unreachable — `/api/healthz`
hits the api-server's health route instead (tell-tale: `X-Powered-By: Express`).

**How to apply:** to add a NEW API path to instant-attorney you must add it to that
`paths` array (via the artifacts skill, not by hand-editing artifact.toml). For
liveness checks, use a path instant-attorney already owns — `/login` (its own
production `health.startup` path) or `/api/auth`, `/api/wizard`, `/api/documents`,
etc. Don't invent `/api/health*`; it belongs to the api-server.
