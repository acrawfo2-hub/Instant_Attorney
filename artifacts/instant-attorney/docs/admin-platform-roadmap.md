# Admin platform: operating model and automation boundary

The admin console is intentionally split into three planes:

1. **People** is the IT help desk. It diagnoses the complete account state and
   exposes narrow, audited repairs: confirm email, clear a lockout, send a reset
   link, set a temporary password, create a missing profile, and repair access.
2. **Health** is the operations desk. It runs read-only probes that continue to
   work when one subsystem is down.
3. **Growth** is the management desk. It combines first-party traffic with
   accounts, matters, documents, consults, and subscriptions and produces a CSV
   report from the same canonical snapshot as the screen.
4. **Support** is the service desk. It is deliberately reachable before login,
   prioritizes access failures, links matched accounts to People for diagnosis,
   and requires a resolution summary before a ticket can be closed.

`ADMIN_EMAILS=acrawfo2@gmail.com` should be set in the deployed server
environment. It is a break-glass root credential, not a browser-visible
variable. The profile should also have `is_attorney = true` for ordinary access;
the email allowlist exists so the console remains reachable if profile reads are
the outage.

## Agent integration

An IT agent should call a future server-to-server tool gateway, not receive a
Supabase service-role key and not drive the browser. The gateway should reuse
the existing diagnosis and repair functions, require a scoped machine identity,
record every attempt in `admin_audit_log`, and apply these autonomy levels:

| Level            | Agent may do                                                        | Approval                   |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| Observe          | Search accounts, diagnose access, run health checks, draft a report | None                       |
| Safe action      | Send a reset link, resend confirmation, clear an expired lockout    | Policy-controlled          |
| Sensitive action | Set a temporary password, change entitlement, create profile data   | Human confirmation         |
| Database change  | Apply migrations, edit RLS, run arbitrary SQL, delete/restore data  | Never from the admin agent |

The last boundary is deliberate. The admin site can safely expose **specific,
idempotent, tested runbooks** for known database faults. It should not expose a
general SQL console or the service-role secret to Grok, Hermes, OpenClaw, or any
other agent. Schema and RLS repairs belong in reviewed migrations with backups,
advisors, staging verification, and a human-controlled deployment.

## Why support is not only an orchestrator tool

The normal legal orchestrator is useful after authentication: it can recognize
frustration, offer self-service steps, and—with explicit consent—open a ticket
using the same support API. It cannot be the only entrance because the users who
most need login support cannot reach it. Account recovery therefore stays a
deterministic public flow: reset first, then a structured ticket, then the admin
diagnosis and audited repair tools. The legal assistant must never receive a
password, diagnose auth state from conversational guesses, or perform a
service-role repair itself.

## Next phases

- Add outbound support email and a signed, expiring requester link for secure
  client-visible replies; do not expose tickets by guessable ticket number.
- Add a machine-identity table with hashed credentials, scopes, expiry,
  revocation, per-agent rate limits, and mandatory audit correlation IDs.
- Add saved report definitions and scheduled email delivery after retention and
  consent requirements are settled.
- Add funnel events (landing → registration → first matter → first document →
  consult) rather than inferring every conversion from page views.
- Add data-retention jobs for page-view detail while preserving daily rollups.
