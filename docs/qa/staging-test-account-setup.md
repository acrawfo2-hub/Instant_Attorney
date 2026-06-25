# Staging Test Account Setup Guide

Minimal steps to stand up a **staging** environment and test accounts for Instant Attorney QA — both manual UAT and automated checks (`e2e.mjs`, Playwright).

> **Never use production Stripe keys or real client PII on staging.** Use Stripe test mode, disposable emails, and a dedicated Supabase project (or schema) when possible.

---

## 1. Environment checklist

Copy `.env.local.example` to `artifacts/instant-attorney/.env.local` and fill in:

| Variable | Required for | Notes |
|----------|--------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Everything | Staging Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App + Playwright redirects | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Playwright submit tests, e2e-t002 | Server-only — never commit |
| `Claude_Instant_Attorney` | AI features | Anthropic API key (code reads this name, not `ANTHROPIC_API_KEY`) |
| `STRIPE_SECRET_KEY` | Onboarding checkout | `sk_test_...` only |
| `STRIPE_WEBHOOK_SECRET` | Subscription activation | From `stripe listen` locally or Stripe dashboard webhook |
| `STRIPE_PHASE2_PRICE_ID` | $9.99/mo plan | Test-mode Price ID |
| `STRIPE_CONSULT_PRICE_ID` | $49.99 consult | Test-mode Price ID |
| `STRIPE_TOPUP_PRODUCT_ID` | Usage top-ups | Test-mode Product ID |
| `RESEND_API_KEY` | Submit → attorney email | Optional for submit API tests (email fires async) |
| `ATTORNEY_EMAIL` | Notification recipient | Your inbox for manual verification |
| `APP_URL` | Cron scripts | Staging origin, e.g. `https://staging.instant-attorney.com` |

**Dev-only (never in production):**

```env
BYPASS_AUTH=false
NEXT_PUBLIC_BYPASS_AUTH=false
```

---

## 2. Database migrations

Apply SQL migrations **in order** in the Supabase SQL editor (`artifacts/instant-attorney/supabase/`):

1. `schema.sql`
2. `schema-stage2.sql` through `schema-stage22.sql` (and any later stage files)
3. Optionally run `schema-verify.sql` to sanity-check

Playwright submit tests and `e2e.mjs` expect stage 8+ columns on `documents` (`parent_document_id`, `attorney_second_draft_prompt`).

---

## 3. Test accounts to create

You need **at least two** accounts for full P0 coverage:

### A. Client test account (`E2E_EMAIL`)

Used by: `e2e.mjs`, Playwright `auth-login.spec.ts`, manual UAT.

**Option 1 — UI registration (closest to real users)**

1. Start the app: `cd artifacts/instant-attorney && npm run dev`
2. Visit `/register` with a disposable email (e.g. `qa-client+staging@yourdomain.com`)
3. Confirm email via Supabase Auth → Users → confirm, or click the magic link
4. Complete onboarding: Representation Agreement → AI Consent → Stripe test card `4242 4242 4242 4242`
5. Land on `/dashboard`

**Option 2 — Admin API (faster, used by Playwright submit fixture)**

```bash
# Requires SUPABASE_SERVICE_ROLE_KEY in env
curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-client@staging.test","password":"YourSecurePw1!","email_confirm":true}'
```

Then seed onboarding rows (profiles, subscriptions, consents, agreements) — Playwright's `e2e/helpers/supabase-fixtures.ts` does this automatically per test run.

Store credentials in GitHub Actions secrets or local env:

```env
E2E_EMAIL=qa-client@staging.test
E2E_PASSWORD=YourSecurePw1!
```

### B. Attorney test account (`E2E_ATTORNEY_EMAIL`, optional)

Used by: manual attorney workflow, future Playwright attorney tests.

1. Create a second user (register or admin API)
2. In Supabase SQL editor:

```sql
update profiles
set is_attorney = true
where email = 'qa-attorney@staging.test';
```

3. Log in and confirm `/attorney` loads (non-attorneys are redirected to `/dashboard`)

---

## 4. Stripe test mode

1. Dashboard → toggle **Test mode**
2. Create Products/Prices matching `STRIPE_PHASE2_PRICE_ID` and `STRIPE_CONSULT_PRICE_ID`
3. For local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/subscriptions/webhook
# Copy whsec_... into STRIPE_WEBHOOK_SECRET
```

4. Test card: `4242 4242 4242 4242`, any future expiry, any CVC

To simulate a failed top-up, use Stripe's [decline test cards](https://docs.stripe.com/testing#declined-payments).

---

## 5. Running automated checks

### Smoke (no browser, no AI cost)

```bash
cd artifacts/instant-attorney
BASE_URL=https://your-staging-url \
  E2E_EMAIL=$E2E_EMAIL E2E_PASSWORD=$E2E_PASSWORD \
  NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
  node scripts/e2e.mjs
```

Set `E2E_STRICT=1` to fail on missing secrets (CI behavior).

### Playwright P0 (browser + API)

```bash
cd artifacts/instant-attorney
npm install
npx playwright install chromium

PLAYWRIGHT_BASE_URL=https://your-staging-url \
  E2E_EMAIL=$E2E_EMAIL E2E_PASSWORD=$E2E_PASSWORD \
  NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
  npm run test:playwright
```

| Spec | Needs | What it verifies |
|------|-------|------------------|
| `auth-redirects.spec.ts` | Running app + Supabase configured | Protected routes → `/login`; public routes OK |
| `auth-login.spec.ts` | `E2E_EMAIL` / `E2E_PASSWORD` | Login form + session cookie; guest redirect |
| `document-submit.spec.ts` | Service role key | Seeds draft via DB, submits via API, asserts `pending_review` |

### Full AI path (costs API credits, ~3 min)

```bash
node --env-file=.env.local scripts/e2e-t002.mjs
```

---

## 6. GitHub Actions secrets

For scheduled smoke (`/.github/workflows/ci.yml`):

| Secret | Value |
|--------|-------|
| `E2E_BASE_URL` | Staging origin |
| `E2E_EMAIL` | Client test account email |
| `E2E_PASSWORD` | Client test account password |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |

---

## 7. Manual UAT happy path (15 min)

1. **Phase I** — `/free-chat` as anonymous user; confirm no login wall
2. **Register + onboard** — client account through Stripe test checkout
3. **Intake** — `/chat`; describe a case; confirm facts appear on dashboard
4. **Wizard** — `/wizard/demand_letter`; wait for draft (slow); click **Send to Attorney**
5. **Attorney** — log in as attorney; `/attorney` shows pending doc with SLA clock
6. **Approve** — review and approve; client downloads `.docx`
7. **Billing** — confirm meter visible on dashboard after AI usage

---

## 8. Cleanup

Playwright submit tests auto-delete provisioned users. For manual admin-created users:

```bash
# Delete via Supabase dashboard: Authentication → Users → Delete
# Or admin API DELETE /auth/v1/admin/users/{id}
```

Periodically purge test `case_files` and `documents` if fixtures fail mid-run.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Redirects don't fire | `NEXT_PUBLIC_SUPABASE_URL` / anon key missing — middleware passes through |
| Login 401 | Wrong password or user not email-confirmed |
| Submit 404 | Migration drift — run `e2e.mjs` schema check |
| Submit succeeds but attorney queue empty | Logged in as wrong user; doc `user_id` mismatch |
| Stripe checkout fails | Test keys on live Price IDs (or vice versa) |
| Playwright skipped | Missing `E2E_EMAIL` or `SUPABASE_SERVICE_ROLE_KEY` — expected locally without secrets |
