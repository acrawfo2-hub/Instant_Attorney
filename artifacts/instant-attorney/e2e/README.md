# End-to-end tests

Playwright, Chromium, against a running app. `npm test` covers pure logic and
never touches a browser, a database or a model — these cover what it cannot.

## Running them

```bash
# 1. Build and start the app (its own env; next.config.ts needs these at load)
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run build
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... PORT=21203 npm run start

# 2. Point the tests at it
PLAYWRIGHT_BASE_URL=http://localhost:21203 npm run test:playwright
```

## What runs without credentials

The middleware and route-shape specs (`auth-redirects.spec.ts`) need nothing but
a running app. Everything else skips itself.

## What each extra secret unlocks

| Env | Unlocks |
|---|---|
| `E2E_EMAIL`, `E2E_PASSWORD` | `auth-login.spec.ts` — real sign-in, attorney/non-attorney separation |
| `SUPABASE_SERVICE_ROLE_KEY` | the fixture-seeded specs: document submit, draft indicators, opening a draft from chat |
| `Claude_Instant_Attorney` | nothing here yet — no spec drives a model call. See below. |

`e2e/helpers/env.ts` gates on these, so a missing secret skips rather than
fails. That is deliberate, and it is also the trap: **a skipped suite looks like
a passing one in a terminal you are half-watching.** Read the skip count.

## Running in this container

The repo pins a newer `@playwright/test` than the preinstalled browsers, so the
bundled headless shell does not exist and `npx playwright install` is blocked.
Point at the Chromium that is installed:

```ts
launchOptions: { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }
```

## The gap worth naming

No spec drives a real model call, so nothing here exercises the drafting engine
end to end: whether a demand letter comes back with its markers intact, whether
an unknown forum really produces `[[GOVERNING COURT OR JURISDICTION …]]` rather
than a guessed one, whether a truncated response is refused. `document-drafting.test.ts`
covers those against a stubbed client — it proves the plumbing, not the output.

That is the highest-value suite still missing, and it needs an API key plus a
budget decision about spending real tokens in CI.

## Why the API-route assertions exist

`auth-redirects.spec.ts` asserts that retired routes answer **404**, not 401.

Page routes cannot show this. Middleware redirects an unauthenticated request to
`/login` whether or not the page exists — which is why `/wizard/demand_letter`
stayed in the protected-routes list and kept passing after the wizard was
deleted, asserting nothing at all. API routes answer with JSON, so a deleted one
404s and a live one does not. The `/api/chat-acp` case is the control: if the app
were simply not serving `/api`, every other assertion would pass for the wrong
reason.
