# Design Note: The Admin Console — Detect, Repair, Endure

**Status:** Phases 0, 1 and 2 shipped. See §5 for what is built.
**Phases 3–4: not being built.** Each proposed an automated repair for an
incident that has not happened. Speculative repair actions are themselves a
failure surface — they run with elevated privilege against production data on a
trigger nobody has validated. Build one only when a real incident names it, and
write the incident down first. (Consolidation decision, 2026-08-12.)
**Author:** Instant Attorney engineering
**Related:** `app/admin/page.tsx` (today's Token Limit Monitor), `lib/admin-auth.ts`,
`lib/testers.ts`, `scripts/ensure-tester.mjs`, `supabase/schema-stage46-auth-access-repair.sql`,
`supabase/schema-verify.sql`, `supabase/schema-verify-stage38-45.sql`,
`.replit-artifact/artifact.toml`, `.agents/memory/MEMORY.md`.

---

## 1. The insight

The repairs already exist. They are just not reachable.

When a real, paid-up client cannot log in, the fix is already written down:
`schema-stage46-auth-access-repair.sql` enumerates the four ways it happens — a
`subscriptions.status` constraint that never learned `'bypass'`, a missing unique
index that silently voids every `upsert(..., { onConflict: "user_id" })`, an
`auth.users` row with no `profiles` mirror, a dropped `on_auth_user_created`
trigger. `scripts/ensure-tester.mjs` is the same repair as a Node script.
`.agents/memory/` holds forty more failure modes, each one hard-won.

Every one of those repairs today requires the same three things: Andrew, a
terminal or the Supabase SQL editor, and the memory of which file applies. That
is the actual fragility. Not the absence of fixes — the **distance** to them.

So the thesis of this note:

> **Durability is not fewer failures. It is that every known failure is
> self-detecting and one-click repairable, by one person, from a phone, in under
> a minute.**

This is the right definition specifically for an AI-assisted codebase. Code written
fast accumulates failure modes faster than it accumulates operators. You cannot
out-engineer that with care alone; the only thing that scales is making each
discovered failure permanently *cheap* — converting it, once, from tribal knowledge
into a probe and a button. The console is where those land.

Three failure classes justify the whole build, and all three are already documented
in this repo:

1. **Silent-write failures.** An unapplied migration returns PGRST205 and the write
   *looks* like it succeeded (`instant-attorney-supabase-migrations.md`). Nothing in
   the product ever tells you. You find out when a client does.
2. **Silent-shadow failures.** An `/api/*` prefix missing from `artifact.toml` falls
   through to Express and 404s, while typecheck and tests stay green
   (`instant-attorney-routing.md`). Already happened to `/api/attorney`.
3. **Silent-cost failures.** A model without a `lib/usage-tracker.ts` pricing entry
   bills at Sonnet's rate forever (`instant-attorney-model-pricing.md`).

Each is invisible from inside the app by construction. A console that merely displays
data will not catch them. It has to *probe*.

---

## 2. What exists today

`/admin` is a single server component rendering a **Token Limit Monitor** — a
1000-row scan of `usage_events` for calls that would have hit the retired token caps.
It is useful and it is narrow. Alongside it: `/admin/archives` (retention runs, legal
holds, destruction) and `/admin/attorney-signups` (approve/deny attorney accounts).
The gate is `lib/admin-auth.ts` → `getAttorneyUserId()`, which reads
`profiles.is_attorney`.

Two structural problems with that gate, worth fixing before anything is built on top:

- **It depends on the thing most likely to be broken.** `instant-attorney-rls-recursion.md`
  records an RLS policy on `profiles` that sub-selected `profiles` and produced 42P17
  recursion, breaking *all profile reads*. In that state today's admin gate returns
  `null` and locks you out — precisely when you need the console most. The console
  must have a **break-glass path** that does not touch `profiles`.
- **`BYPASS_AUTH=true` makes `getAttorneyUserId()` return `BYPASS_USER_ID`
  unconditionally.** For a page that will hold service-role repair actions over
  privileged client data, that is not an acceptable dev shortcut. Admin routes should
  refuse to honour `BYPASS_AUTH` when `NODE_ENV === "production"`, loudly.

The Token Limit Monitor is not the admin site. It is one card inside it.

---

## 3. Shape: three surfaces and a registry

`/admin` becomes a shell with its own nav — **Overview · People · Health · Repairs ·
Usage · Audit** — and today's monitor demotes to a card under Usage.

### 3.1 People — unlock anyone in under a minute

One search box, by email. One page per account, assembled with the service client:

| Source | Fields that decide whether they can get in |
|---|---|
| `auth.users` | exists, `email_confirmed_at`, `last_sign_in_at`, `banned_until` |
| `profiles` | row present at all, `account_type`, `is_attorney`, `attorney_user_status` |
| `subscriptions` | `status`, `plan`, `current_period_end`, `consult_credits` |
| Stripe | customer linked, last successful charge |

Above the fold, one sentence — the **verdict**, not the data:

> **Cannot sign in.** Email was never confirmed, and there is no `profiles` row
> (account predates the `on_auth_user_created` trigger).

The verdict is computed by the same predicates the repairs use, so it can never
disagree with them. Below it, only the repairs that actually apply to this account:

- **Send password reset link** — wraps the existing `resetPasswordForEmail` flow.
- **Set a temporary password** — `auth.admin.updateUserById`. The one that matters
  when someone is on the phone and email is the broken thing.
- **Force-confirm email** — generalises `confirmTesterEmail()` beyond `TESTER_EMAILS`,
  gated on admin auth instead of an allowlist.
- **Create missing profile row** — stage 46 §4, scoped to one user.
- **Grant / repair subscription** — stage 46 §6, with plan and comp reason.
- **Clear lockout / un-ban**, **sign out everywhere** (revoke refresh tokens),
  **change email address**.

Every one already exists as SQL or script logic. This is a re-hosting job, not new
mechanism — which is exactly why it is worth doing first.

**Non-negotiable:** each action writes an `admin_audit_log` row (actor, target,
action, before/after, reason, timestamp). This is a law firm; an operator who can set
a client's password must leave a trail, and the trail is what makes it safe to give
the button real power.

### 3.2 Health — is everything up

Not uptime pings. Probes that assert the specific invariants this system breaks:

| Probe | Catches | Repair |
|---|---|---|
| **Schema drift** — run `schema-verify.sql` + `schema-verify-stage38-45.sql` as structured checks | The PGRST205 silent-write class | Show the exact staged file to apply |
| **Route shadowing** — HEAD each `/api/*` prefix, assert no `X-Powered-By: Express` | `artifact.toml` omissions | Name the missing prefix |
| **Model pricing coverage** — every model string in routes ∈ `MODEL_PRICING_USD_PER_M` | Silent cost fallback to Sonnet | Name the unpriced model |
| **Anthropic** — streamed one-token ping | Bad/expired `Claude_Instant_Attorney` key | — |
| **Resend** — API reachable, recent send failures | Lockouts caused by mail not arriving | — |
| **Stripe** — key valid, last webhook received at | Silent webhook death | — |
| **Storage** — bucket list + signed-URL round trip | Broken attachments | — |
| **Stuck ACP turns** — in-process registry, jobs running > N min | `finishAcpJob` never ran → later turns queue forever | Release job |
| **Env sanity** — required vars present; `BYPASS_AUTH !== "true"` in prod | The worst possible misconfiguration | — |
| **Crash guard** — `unhandledRejection` count, 24 h | Instrumentation's log-and-survive path hiding real breakage | — |

Each renders green / amber / red with latency, last-checked, a link to the memory
file that explains it, and — where one exists — a **Fix** button.

Two notes on accuracy. ACP jobs live in an **in-process registry** on a single
instance, so this probe reports post-restart state as "not running" and that is
correct, not a bug to paper over. And schema drift is the highest-value probe on the
board: it is the only one of the ten that is *completely* invisible from inside the
running product.

### 3.3 Repairs — IT fixes without a terminal

- **Migration ledger.** Add a `schema_migrations` table; have each staged
  `supabase/*.sql` file insert its own filename as its last statement. The console
  then diffs `supabase/*.sql` on disk against applied rows and shows *exactly* which
  files are outstanding, with copy-to-clipboard SQL. This single change retires the
  entire silent-migration failure class — it is the highest durability-per-line
  change in this document.
- **Tester allowlist in the database.** `TESTER_EMAILS` is hardcoded in
  `lib/testers.ts`, so adding a tester requires a deploy. Move to a `tester_allowlist`
  table with the constant as fallback; manage from the console.
- **Run archival cron on demand** — `/api/admin/archives/run` already exists; surface it.
- **Release a stuck ACP job**, **replay a failed Stripe webhook**, **re-send a
  document delivery**.

---

## 4. Why this one does not rot

Four commitments. They are the actual content of "durable"; the panels above are just
the first tenants.

**1. A check registry, not hardcoded panels.** Every probe and repair is one small
object in `lib/admin/checks/`:

```ts
export const emailNeverConfirmed: Check = {
  id: "auth.email-unconfirmed",
  title: "Email never confirmed",
  severity: "blocks-login",
  memo: ".agents/memory/instant-attorney-tester-allowlist.md",
  run: async (ctx) => { /* … */ },
  repair: { label: "Force-confirm email", confirm: true, run: async (ctx) => { /* … */ } },
};
```

The console renders the registry. Adding a failure mode is adding a file — never
editing a page. A unit test asserts every registered check has a unique `id`, a
`memo` that resolves to a real file, and a `run` that returns within its timeout.
The admin surface then grows *with* the system instead of lagging it.

**2. Memory becomes executable.** `.agents/memory/` is currently forty markdown files
a human has to remember to read. Every entry describing a *detectable runtime
condition* should graduate into a registered check. The memo link stays, so the
console explains as well as detects. Target: the memory index and the check registry
converge, and the standing rule for new gotchas becomes *"write the memo, register the
check."*

**3. The console must survive the app being broken.** This is the part most admin
pages get wrong. If Supabase schema is drifted, `/api` is shadowed, or profile reads
are recursing, the console must still render and *say so*. Concretely:

- Own minimal layout — no dependency on the app shell or its providers.
- Each panel independently error-boundaried and independently fetched; a failed probe
  renders red, never 500s the page.
- Break-glass auth: an `ADMIN_EMAILS` env allowlist checked against the JWT email,
  used when the `profiles` read itself fails.
- Health probes read through the service client and tolerate missing tables — a
  missing table is a *finding*, not an exception.

**4. Power is paired with a trail.** Service-role repair actions over privileged
client data require: `admin_audit_log` on every mutation, a typed reason on
destructive ones, re-auth for password and email changes, rate limits on the
account-search endpoint, and account **metadata** in People — never case content —
so routine ops work never incidentally surfaces privileged material.

---

## 5. Sequence

Ordered by (incidents retired) ÷ (effort), not by visual payoff.

| Phase | Scope | State |
|---|---|---|
| **0** | Admin shell + nav; break-glass auth; `admin_audit_log`; refuse `BYPASS_AUTH` in prod | **Shipped** |
| **1** | **People**: account 360, verdict line, the repairs | **Shipped** |
| **2** | **Health**: check registry + the ten probes | **Shipped** |
| **3** | **Repairs**: `schema_migrations` ledger, DB tester allowlist, cron + job actions | Proposed |
| **4** | **Usage & Audit**: cost-per-feature, audit search | Partly shipped — the Token Limit Monitor moved to `/admin/usage` and the audit trail is on the Overview |

Phase 1 is the one that changes your week. Phase 3 is the one that changes the
system's failure rate.

### What phases 0–1 actually built

| Piece | Where |
|---|---|
| Shell, nav, single gate, break-glass banner | `app/admin/layout.tsx`, `components/admin/AdminNav.tsx` |
| Admin auth: prod bypass refusal + `ADMIN_EMAILS` | `lib/admin-auth.ts` (`requireAdmin`) |
| Audit trail | `supabase/schema-stage47-admin-console.sql`, `lib/admin/audit.ts` |
| Verdict + repair rules (pure, 22 unit tests) | `lib/admin/account-diagnosis.ts` |
| Reads, degrading | `lib/admin/account-lookup.ts` |
| Repair executors | `lib/admin/account-repairs.ts` |
| API | `app/api/admin/accounts/…` |
| UI | `app/admin/page.tsx`, `app/admin/people/page.tsx`, `components/admin/AccountConsole.tsx` |

Six repairs ship: force-confirm email, create missing profile row, grant/repair
subscription, clear lockout, send reset link, set temporary password.

**One repair from §3.1 was cut.** "Sign out everywhere" is not implementable
against supabase-js today — `auth.admin` exposes no per-user session revoke, only
`signOut(jwt)` with the user's own token. Shipping a button that might 404
against this project's GoTrue would undermine the point of the console, so it was
left out; setting a temporary password is the credential-rotation tool until an
admin revoke is verified against the live instance. "Change email address" was
also deferred — it needs its own confirmation flow, not a one-click button.

**Two properties were verified, not just intended.** With `BYPASS_AUTH=true`
under `next start`, `/admin` 307s to `/login` and logs the refusal. With an
unreachable Supabase, `/admin`, `/admin/people` and `/admin/usage` all return 200
and render per-panel error text — no 500, and counts show `—` rather than a
misleading `0`.

**Before this is useful in production:** apply
`supabase/schema-stage47-admin-console.sql` and set `ADMIN_EMAILS`. Repairs work
without the migration, but run unaudited — and the UI says so on every action.

### What phase 2 built

| Piece | Where |
|---|---|
| Check contract + status algebra | `lib/admin/checks/types.ts` |
| Catalog — the ten checks, metadata only | `lib/admin/checks/catalog.ts` |
| Runners, bound to catalog ids | `lib/admin/checks/runners.ts` |
| Registry: timeouts, error isolation, unbound-entry reporting | `lib/admin/checks/index.ts` |
| Owned `/api/*` prefixes | `lib/admin/api-surface.ts` |
| Schema verifier as an RPC | `supabase/schema-stage48-schema-verifier.sql` |
| Crash-guard counters | `lib/crash-counter.ts`, wired in `instrumentation.ts` |
| API | `app/api/admin/health/route.ts` |
| UI | `app/admin/health/page.tsx`, `components/admin/HealthBoard.tsx` |

**Schema drift is checked over RPC, not by head-selects.** `admin_schema_verify()`
folds the expectations from `schema-verify.sql` and `schema-verify-stage38-45.sql`
into one callable function — 36 tables, 32 columns, 4 indexes, 5 RLS flags, 3
check constraints, the signup trigger, and the "every auth user has a profile"
data invariant. A per-table head-select was rejected because
`.agents/memory/instant-attorney-supabase-migrations.md` records that it returns
false OKs, which is worse than no check at all.

**Route shadowing is checked twice, at different times.** `api-surface.test.ts`
asserts the prefix list equals the directories under `app/api/` *and* is covered
by `artifact.toml` — build-time drift. The `routing.api-shadow` probe HEADs a
non-existent path under each prefix against the live origin and flags anything
answering `X-Powered-By: Express` — deploy-time reality, the only thing that
actually proves it. Verified against a production build: Next answers
`X-Powered-By: Next.js`, so the discriminator is clean, and 12 parallel probes
complete in ~320ms. Under `next dev` the probes can exceed their timeout because
routes compile on demand; the check says so rather than reporting a false red.

**The test caught a live bug on its first run.** `/api/workspace`,
`/api/assess-matter` and `/api/dropbox-sign` had routes under `app/api/` but were
absent from `artifact.toml`, so the proxy handed them to Express.
`/api/workspace` is the orchestrator's draft side panel and `/api/assess-matter`
backs `MatterStandingCard` — both are fetched by the client on normal pages. All
three were added to the `paths` array.

**Registry invariants are enforced by test, not convention.** `catalog.test.ts`
asserts unique namespaced ids, that each id matches its declared group, that every
`memo` path resolves to a real file, that every catalog entry has a runner and
every runner a catalog entry, and that the three invisible-failure checks stay in
the catalog. Adding a failure mode is a catalog entry plus a runner; the Health
page renders whatever the catalog contains and is never edited.

**Not yet done from §3.2:** there are no **Fix** buttons on the board. Every check
reports what to do in words; none of them act. That is deliberate for now — the
schema and routing fixes are file edits and redeploys, not runtime operations, so
the honest surface is instructions. Phase 3's migration ledger is where repairs
become actionable.

---

## 6. Open questions

- **Impersonation.** "View as client" is the fastest way to diagnose a UI-level
  complaint and the sharpest privilege in the console. Options: full impersonation
  with a persistent banner and audit row; a time-boxed magic link; or read-only
  state inspection with no session at all. Recommend starting with **read-only
  inspection** and adding a session only when a real support call demands it.
- **Alerting.** The console answers "is everything up" when you *look*. Red probes
  should also push — email via Resend, or a daily digest. Cheap to add once the
  registry exists; out of scope until then.
- **Mobile.** "Unlock a client from a phone" is a real requirement if support
  happens by call. It constrains People's layout and nothing else.
