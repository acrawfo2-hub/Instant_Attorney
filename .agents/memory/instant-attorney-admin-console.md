# Admin console (/admin)

The operator console. Design and phase plan: `docs/admin-console-design.md`.
Shipped so far: Phase 0 (shell, auth, audit) and Phase 1 (People).

## The gate lives in the layout, not the pages

`app/admin/layout.tsx` calls `requireAdmin()` once and gates every `/admin/*`
page. **Do not re-check `profiles.is_attorney` inside an admin page.** Doing so
defeats the break-glass path — an operator authorised by `ADMIN_EMAILS` whose
profile row is missing or whose `is_attorney` is false passes the layout and is
then bounced by the page. `/admin/archives` and `/admin/attorney-signups` each
had their own copy of the gate; both were removed for exactly this reason.

## Break-glass access

`ADMIN_EMAILS` (comma-separated) grants admin without reading `profiles`. It
exists because the normal gate depends on the one table that has taken the whole
app down before (42P17 RLS recursion — see
`instant-attorney-rls-recursion.md`). Without it the console locks you out
precisely when it is most needed.

Treat it as a root credential. Every action taken through it is recorded with
`actor_via = 'break-glass'`, and the console shows a banner.

## BYPASS_AUTH is refused in production

`lib/admin-auth.ts` ignores `BYPASS_AUTH=true` when `NODE_ENV === "production"`
and logs an error per request. Admin routes hold service-role password and
subscription writes; a production deploy carrying the dev bypass is an incident,
not a convenience. Verified: `next start` with `BYPASS_AUTH=true` 307s `/admin`
to `/login` and logs the refusal.

## Panels must degrade, never throw

Every read in `lib/admin/account-lookup.ts` returns its error *alongside* the
data, and `diagnoseAccount()` turns those errors into findings. A missing table
or an unreachable Supabase renders as a red panel saying so — not a 500, and
never a fake `0`. Verified against a placeholder Supabase URL: `/admin`,
`/admin/people` and `/admin/usage` all return 200 with per-panel error text.

Keep this property when adding panels. Optional columns (`consult_credits`,
stage-33 profile columns) are re-queried without them when the first read fails,
because an unapplied migration must degrade the page rather than break it.

## The verdict and the repairs come from one place

`lib/admin/account-diagnosis.ts` is pure and dependency-free (node:test cannot
resolve `@/` anywhere in a test's import graph). It computes both the headline
verdict and the list of repairs to offer, so the two can never disagree. Add a
new failure mode by adding a `Finding` there — with a `repair` id if it is
fixable — never by special-casing the UI.

## Unaudited actions are surfaced, not swallowed

`recordAdminAction()` returns false when the row could not be written (usually
stage 47 unapplied). `executeRepair()` passes that through as `unaudited: true`
and the UI says the action was **not recorded**. Do not quietly drop it.

## No "sign out everywhere"

supabase-js `auth.admin` has no per-user session revoke — `signOut()` takes the
user's own JWT. It was deliberately left out rather than shipped as a button
that might 404 against this project's GoTrue. Setting a temporary password is
the credential-rotation tool until an admin revoke is verified live.

## Schema

`supabase/schema-stage47-admin-console.sql` adds `admin_audit_log`. `actor_id`
is intentionally **not** a foreign key to `profiles`: the break-glass path exists
for the case where profiles is broken, and an audit insert that fails in exactly
that situation is worse than useless.

`supabase/schema-stage48-schema-verifier.sql` adds `admin_schema_verify()`, the
RPC behind the `database.schema` health check. **When you add a migration stage,
add its objects to the arrays in that file and re-run it** — otherwise the board
reports a stale definition of "current".

## Health checks: catalog + runners, bound by id

Adding a check = one `CHECK_CATALOG` entry in `lib/admin/checks/catalog.ts` plus
one `RUNNERS` entry in `runners.ts`. **Never edit the Health page** — it renders
whatever the catalog contains.

The split exists because node:test cannot resolve `@/` anywhere in a test's
import graph: `catalog.ts` and `types.ts` are import-free and therefore testable,
while `runners.ts` talks to Supabase and the network. `catalog.test.ts` enforces
unique namespaced ids, group/id agreement, memo paths that resolve, and a 1:1
binding between catalog and runners (read from `runners.ts` as source, since it
cannot be imported).

Runner rules: never throw (a thrown error reads as "the check is broken"), assert
a real invariant rather than that the network works, and always populate `fix`.

## Route shadowing is checked twice

`lib/admin/api-surface.ts` lists the `/api/*` prefixes this app owns.

* `api-surface.test.ts` — build time. Asserts the list equals the directories
  under `app/api/` and that every one appears in `artifact.toml`. **This is what
  catches a new API route nobody added to the TOML.** It found `/api/workspace`,
  `/api/assess-matter` and `/api/dropbox-sign` missing on its first run.
* `routing.api-shadow` check — deploy time. HEADs `<prefix>/__shadow-probe` and
  flags `X-Powered-By: Express`. Next answers `X-Powered-By: Next.js`, so the
  discriminator is clean. Only a real deployment can prove this.

Under `next dev` the probes often exceed their timeout because routes compile on
demand — that reports as a warning with an explanation, not a false red. Against
a production build, 12 parallel probes take ~320ms.

**Do not name any admin route `/api/health*`** — that path belongs to the Express
api-server. The board lives at `/api/admin/health`.
