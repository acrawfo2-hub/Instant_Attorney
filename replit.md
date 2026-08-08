# Instant Attorney

An AI legal assistant for Crawford Law PLLC (Texas Bar #24148908, Andrew
Crawford, Esq.). Subscribed clients talk to an AI **orchestrator** in a
privileged, attorney-supervised channel: it gives real legal advice, keeps a
"Living File" of confirmed facts and gaps, runs the firm's deterministic legal
calculators as tools, drafts documents into an editable side panel, and hands
anything the client will file or sign to Andrew for a 48-hour attorney review.

> **Currently in flight:** the product moved from guided drafting *wizards* to
> the orchestrator model, and wizard-era code and prompt guardrails are still
> present. Before changing prompts, chat flow, or anything under
> `app/wizard/` — read **[`docs/orchestrator-migration-plan.md`](docs/orchestrator-migration-plan.md)**.
> It lists what is intentionally still there, what is dead, and the order to
> remove it in.

## Run & Operate

**The product lives in `artifacts/instant-attorney` and is a standalone npm
project, deliberately excluded from the pnpm workspace.** Run its commands from
that directory with **npm**, not pnpm, and not `pnpm --filter` (which matches
nothing).

```bash
cd artifacts/instant-attorney
npm run dev          # Next.js dev server (port 21203)
npm run typecheck    # tsc --noEmit
npm test             # node:test unit suite — 661 tests
npm run test:playwright   # P0 browser tests
```

Workspace-level (the other artifacts, which use pnpm):

- `pnpm run typecheck` — typechecks the pnpm packages **only**; does not cover
  instant-attorney
- `pnpm --filter @workspace/api-server run dev` — API server (port 5000)

Required env for instant-attorney: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`Claude_Instant_Attorney` (the Anthropic key — note the non-standard name),
`RESEND_API_KEY`, `SESSION_SECRET`. See `.env.local.example`.
`BYPASS_AUTH` must **never** be `true` in production.

## Stack

- **instant-attorney** (the product): Next.js 15 App Router, React 19,
  TypeScript 5.9, Tailwind 3, **npm**. Data via **Supabase** (Postgres + RLS +
  Storage) accessed directly with `@supabase/supabase-js` — *not* Drizzle. AI via
  `@anthropic-ai/sdk` (`claude-sonnet-4-6`), always streamed.
- **api-server**: Express 5 scaffold, Drizzle + Postgres, pnpm workspace. Owns
  the `/api` path prefix in the proxy (see Gotchas).
- **mockup-sandbox**: Vite + React design sandbox, not user-facing.
- **lib/**: shared pnpm packages (`api-spec`, `api-zod`, `api-client-react`,
  `db`) used by api-server, not by instant-attorney.

## Where things live

| What | Where |
|---|---|
| The product | `artifacts/instant-attorney/` |
| Orchestrator chat UI | `app/chat/page.tsx` (always runs `mode: "freestyle"`) |
| Orchestrator backend | `app/api/chat-acp/route.ts` — agentic tool loop, max 5 iterations |
| Orchestrator tools | `lib/orchestrator-tools.ts` — 18 tools + Anthropic web search/fetch |
| **All AI prompts** | `lib/prompts.ts` — single source of truth |
| Living File assembly | `buildFileContext()` in `lib/prompts.ts` |
| Living File parsing | `lib/file-parser.ts`, `lib/living-file-extractor.ts` |
| DB schema (source of truth) | `artifacts/instant-attorney/supabase/*.sql` |
| Legal/statute data catalogs | `lib/*-statutes.ts`, `lib/*-instruments.ts` |
| Client-facing legal docs | `artifacts/instant-attorney/legal/*.md` |
| Design docs | `docs/` |
| QA resources | `docs/qa/` |
| Durable agent notes | `.agents/memory/` (indexed in `MEMORY.md`) |

## Architecture decisions

- **Orchestrator, not wizards.** One conversation decides what to ask, explain,
  analyze, or draft. There is no mode toggle — `app/chat/page.tsx:183` hardcodes
  freestyle. The older guided-wizard flow still exists but is being retired; see
  the migration plan.
- **Deterministic calculators are tools, not prose.** Means test, child support,
  SOL screens, property division, etc. live in vetted `lib/*.ts` modules and are
  exposed to the model as tools. The model must call them rather than compute.
  Every call is audited to `orchestrator_tool_calls`.
- **Two draft stores, on purpose (for now).** `client_workspace_drafts` holds
  orchestrator side-panel drafts; `documents` holds anything submitted for
  attorney review. Promotion is the one-way bridge
  (`/api/workspace/drafts/[id]/promote`), so brainstorming never floods the
  review queue. Phase 3 of the migration plan converges these.
- **Chat turns run detached.** A turn keeps running (and persisting) if the
  browser disconnects; the client re-attaches via `/api/chat-acp/status`.
  `finishAcpJob` must always run or later turns queue forever.
- **Schema is hand-applied SQL.** No migration runner. Staged files in
  `supabase/`, applied by hand in the Supabase SQL editor.

## Gotchas

- **npm, not pnpm, inside `artifacts/instant-attorney`.** It has its own
  `package-lock.json`, which is what the Replit publish build resolves from.
- **`/api/*` routing is path-ownership based.** The Express api-server owns
  `/api`. Any `/api/<x>` **not** listed in
  `artifacts/instant-attorney/.replit-artifact/artifact.toml` → `paths` silently
  falls through to Express (tell-tale: `X-Powered-By: Express`). Add new API
  prefixes there **via the artifacts skill**, not by hand-editing the TOML.
- **Unapplied Supabase migrations fail silently** with PGRST205 — writes look
  like they succeeded. Verify with `supabase/schema-verify.sql` **and**
  `supabase/schema-verify-stage38-45.sql` (the latter covers every
  orchestrator-era object; the original stops at stage 37).
- **Anthropic calls must stream.** A sync `messages.create()` with a large
  `max_tokens` throws and 502s. Use `messages.stream().finalMessage()`.
- **Every model used by a route needs a pricing entry** in `lib/usage-tracker.ts`
  or its cost silently falls back to Sonnet's.
- **Node tests can't use the `@/` alias.** `lib/*.test.ts` and everything in
  their import graph must use relative paths.
- **Adding an import to a route breaks that route's `mock.module` test** at ESM
  link time while typecheck stays green. Update the mock's `namedExports` and
  run `npm test`.
- **Do not re-add document pre-warming.** Permanently retired (stage 13).
- **Known-red:** `lib/stripe.ts:8` pins an `apiVersion` older than the installed
  `stripe` types, so `npm run typecheck` has one pre-existing failure. Phase 0 of
  the migration plan fixes it.

## Pointers

- **[`docs/orchestrator-migration-plan.md`](docs/orchestrator-migration-plan.md)** — the active
  wizard→orchestrator cleanup, sequenced with QA gates. Read before touching
  prompts or chat flow.
- `.agents/memory/MEMORY.md` — index of hard-won, durable gotchas. Check it
  before debugging anything that smells like it has bitten someone before.
- `docs/qa/README.md` — QA matrix, staging account setup, Playwright tests.
- `artifacts/instant-attorney/docs/attorney-review-orchestrator.md` — the
  attorney-side review pipeline (separate from the client orchestrator).
