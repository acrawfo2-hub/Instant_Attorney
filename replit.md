# Instant Attorney

An AI legal assistant for Crawford Law PLLC (Texas Bar #24148908, Andrew
Crawford, Esq.). Subscribed clients talk to an AI **orchestrator** in a
privileged, attorney-supervised channel: it gives real legal advice, keeps a
"Living File" of confirmed facts and gaps, runs the firm's deterministic legal
calculators as tools, drafts documents into an editable side panel, and hands
anything the client will file or sign to Andrew for a 48-hour attorney review.

> **The wizard is gone.** The move from guided drafting *wizards* to the
> orchestrator is complete: `app/wizard/` and `app/api/wizard/` were deleted, and
> the generation pipeline they contained lives in `lib/document-drafting.ts`,
> behind the orchestrator. `WizardType` and `lib/wizard-parsing.ts` survive as the
> instrument taxonomy and the placeholder parser — the engine's vocabulary, not
> the journey's. Before changing prompts, chat flow, or drafting, read
> **[`artifacts/instant-attorney/docs/ARCHITECTURE.md`](artifacts/instant-attorney/docs/ARCHITECTURE.md)**
> and **[`docs/CONSOLIDATION.md`](artifacts/instant-attorney/docs/CONSOLIDATION.md)**.

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

instant-attorney is the only artifact. `pnpm run typecheck` at the root covers
the `scripts` package only; it does not touch instant-attorney.

Required env for instant-attorney: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`Claude_Instant_Attorney` (the Anthropic key — note the non-standard name),
`RESEND_API_KEY`, `SESSION_SECRET`. See `.env.local.example`.
`BYPASS_AUTH` must **never** be `true` in production (`/admin` refuses to honour
it there regardless). Set `ADMIN_EMAILS` so admin break-glass works.

## Stack

- **instant-attorney** (the product): Next.js 15 App Router, React 19,
  TypeScript 5.9, Tailwind 3, **npm**. Data via **Supabase** (Postgres + RLS +
  Storage) accessed directly with `@supabase/supabase-js` — *not* Drizzle. AI via
  `@anthropic-ai/sdk` (`claude-sonnet-4-6`), always streamed.

instant-attorney is the whole product. There is no second stack: an Express
`api-server` (Drizzle + Postgres), a `mockup-sandbox`, and shared `lib/*`
packages (`api-spec`, `api-zod`, `api-client-react`, `db`) used to sit beside
it. Nothing in the product imported any of them and api-server served one route
(`GET /api/healthz`), so they were deleted rather than maintained as a second
architectural option.

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
| Admin console | `app/admin/` (gated once in `layout.tsx`), `lib/admin/` |
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
- **`/api/*` no longer needs registering — keep it that way.** This app owns
  `/` outright in `.replit-artifact/artifact.toml`, so a new route under
  `app/api/` just works. That is new: the Express api-server used to own bare
  `/api`, and because the proxy matches most-specific-first, any prefix missing
  from that TOML's `paths` silently fell through to Express and 404'd while
  typecheck and tests stayed green. It bit four prefixes before the server was
  deleted. Adding a second service to this artifact reintroduces the whole
  failure mode and needs the path enumeration and its guard test back.
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
