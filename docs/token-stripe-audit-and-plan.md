# Token Usage & Stripe Charge Policy — Full Audit + Plan of Action

_Audit date: 2026-07-28 · Scope: orchestrator-based buildout, token metering accuracy, top-up margin, and the customer billing UI._

## 1. Executive summary

The billing engine is fundamentally sound: a per-customer COGS meter (`top_up_ledger`)
accrues on every billable AI event, auto-fires an off-session Stripe charge at a
threshold, and has real idempotency (3 layers), completion-grace, monthly caps, and a
Stripe webhook as the authoritative settle path. Prompt-cache read/write tokens are
priced correctly, and Opus pricing is now present in the map.

Three things needed attention for the orchestrator buildout, and two are **fixed in this
change**:

- **FIXED — `run_what_if` orchestrator tool** ran a full Sonnet generation (up to 8k
  output tokens) inside the tool loop with **no usage recording** → pure margin leak on
  every "what if" tool call.
- **FIXED — grounded government-form lookup** (`gov-form-lookup.ts`) ran a Sonnet call
  with `web_search`/`web_fetch` and **no usage recording** → margin leak on every dynamic
  form detected.
- **OPEN — pricing floor.** If the live top-up charge is the **$7.50** you remember (the
  repo example says `$8.50`), the current margin is only **~29.8%**, below the documented
  **≥35%** floor. This is the strongest reason to move to a **$9.99** top-up now.

The remaining findings (gate coverage, uncosted web-search server-tool fees, config
drift, UI polish) are laid out with a prioritized plan in §6.

---

## 2. How billing works today (source of truth)

| Concern | File | Notes |
|---|---|---|
| Per-token cost | `lib/usage-tracker.ts` → `computeAiCostUsd` | USD/1M map per model; cache writes ×1.25, reads ×0.1. Falls back to **Sonnet** rate for unknown models (undercount risk — see F5). |
| Record an AI event | `lib/usage-tracker.ts` → `recordAiUsage` / `recordAiFromMessage` / `recordAiFromStream` | Inserts `usage_events`, rolls up `usage_period_totals`, and calls `accrueUsage`. Never throws. |
| The meter + auto top-up | `lib/topup.ts` → `accrueUsage` → `triggerTopUp` → `chargeViaStripe` | Threshold crossing fires one off-session PaymentIntent. Overshoot carries forward. |
| Economics config | `lib/billing-config.ts` (env-driven) | `thresholdUsd`, `chargeUsd`, `graceBufferUsd`, monthly limit, included allowance. |
| Pre-call gate | `lib/topup.ts` → `getBillingGate` | Blocks a **new** request while a top-up is `pending`/`blocked` (grace can hold it open). |
| Stripe clients / prices | `lib/stripe.ts` | Subscription ($9.99 phase2), consult ($49.99), attorney_pro. |
| Webhook (authoritative) | `app/api/subscriptions/webhook/route.ts` | `payment_intent.succeeded/failed` settle/fail top-ups; event-id dedupe table. |
| Customer UI | `components/BillingMeter.tsx` + `/api/billing/*` | Cycle bar, monthly-limit bar, grace opt-in, retry, card portal. |

**Economics (steady state):** each successful $X charge reduces the meter by exactly the
threshold, so over many cycles **1 charge ⇔ threshold-worth of COGS**. Everything above
threshold at trigger time carries into the next cycle. That's why margin is computed at
`(charge − threshold − stripeFee) / charge`.

---

## 3. Findings

### F1 — `run_what_if` orchestrator tool was unmetered  ·  Severity: HIGH  ·  **FIXED**
`lib/orchestrator-tools.ts` `run_what_if` created its own `Anthropic` client and ran a
Sonnet generation (`max_tokens` up to 8000) but never recorded usage. Every invocation
was free COGS. **Fix:** records via `recordAiFromMessage(ctx.db, finalMsg, { feature:
"what_if", … })` using the tool context's `userId`/`caseFileId`. Metadata tags it
`source: "orchestrator_tool"` so it's distinguishable on `/admin`.

### F2 — Grounded gov-form lookup was unmetered  ·  Severity: HIGH  ·  **FIXED (tokens)**
`lib/gov-form-lookup.ts` `lookupGovernmentForm` ran a Sonnet call with `web_search` +
`web_fetch` and recorded nothing. **Fix:** `triggerPendingLookups` now threads
`userId`/`caseFileId` into `LookupDeps`, and the lookup records a `gov_form_lookup`
event (lazy `import()` of the tracker so the module's pure helpers stay unit-testable).
**Still open:** the **web-search/web-fetch server-tool fee** (~$0.01/search, billed by
Anthropic on top of tokens) is *not* in COGS anywhere — see F6. The event is tagged
`server_tools: true` + `web_search_requests: N` so a reconciliation pass can price it.

### F3 — Pre-call billing gate covers only 5 of ~14 AI routes  ·  Severity: MED
`getBillingGate` is enforced in `chat-acp`, `wizard`, `what-if`, `roadmap/refresh`,
`documents/[id]/regenerate`. It is **absent** from `assess-matter`, `chat-acp/organize`,
and all `attorney/*` routes — including the **Opus** `attorney/documents/[id]/second-draft`
(the single most expensive call in the app). Metering still happens on these routes, so
nothing goes uncounted; the gap is **overshoot exposure**: a customer already in
`blocked`/`pending` state can still start new spend on an ungated route. Also note that
one gated `chat-acp` request can run up to `MAX_TOOL_ITERATIONS = 5` model turns **plus**
tool AI calls after a single gate check, so "bounded overshoot" is really "one request,"
not "one model call."

### F4 — Config drift: is the live charge $7.50 or $8.50?  ·  Severity: HIGH (margin)
`.env.local.example` and the `getBillingConfig` default say **$8.50 @ $4.75** (≈37.7%).
You referred to a **$7.50** top-up. At **$7.50 @ $4.75 the margin is only ~29.8%** — below
the documented ≥35% floor. **Action:** confirm the live `USAGE_TOPUP_CHARGE_USD` /
`USAGE_TOPUP_THRESHOLD_USD` in the deployed environment before anything else; the pricing
decision in §4 depends on knowing the real starting point.

### F5 — Unknown-model pricing falls back to Sonnet (silent undercount)  ·  Severity: MED
`computeAiCostUsd` uses `DEFAULT_MODEL_PRICING = Sonnet` for any model not in the map.
This already bit the codebase once (Opus second-draft costed at Sonnet rates — see
`.agents/memory/instant-attorney-model-pricing.md`). It's currently correct, but the
failure mode is silent. **Action:** make an unknown model log loudly (and/or cost at the
**Opus** rate as a conservative default) so a future model swap can't quietly erode margin.

### F6 — Server-tool fees (web_search/web_fetch) are entirely outside COGS  ·  Severity: MED
`gov-form-lookup` and the `syncLivingFile`/detection paths use Anthropic server tools that
bill per use on top of tokens. None of that fee is in the meter. Low absolute dollars
today, but it's a structural blind spot in the margin model. **Action:** add a
`server_tool_cost_usd` line to `computeAiCostUsd` (or a small reconciliation job that reads
the `web_search_requests` metadata this change now records).

### F7 — Public `/api/chat` is unauthenticated and unmetered  ·  Severity: LOW (by design)
The landing-page free chat has no user, no gate, no metering. That's an intentional
marketing cost, but it is an uncapped Sonnet surface. **Action:** confirm it's rate-limited
upstream; consider a lightweight per-IP/day cap so it can't be abused into real spend.

### F8 — Attorney work meters against the consumer top-up ledger  ·  Severity: LOW (policy)
`attorney/*` AI usage accrues to the same `top_up_ledger` unless the profile is
`billing_exempt`. If attorneys are meant to be flat-rate (`attorney_pro`), they should be
`billing_exempt` or on a separate meter. **Action:** decide the attorney billing model and
make it explicit rather than incidental.

### F9 — Healthy things worth keeping (verified)
- Prompt-cache write (×1.25) / read (×0.1) pricing is correct.
- Idempotency is genuinely 3-layered (ledger claim, unique `top_up_charges` row, Stripe
  idempotency key) and the webhook dedupes on event id.
- Completion-grace math is bounded and never forgives COGS (collected next cycle).
- Overshoot carry-forward keeps steady-state margin stable.

---

## 4. Pricing: moving the top-up to $9.99

Stripe US card fee = **2.9% + $0.30**. Margin = `(charge − COGS_per_charge − fee) / charge`.

| Scenario | Stripe fee | Profit / charge | Margin | COGS covered / charge |
|---|---:|---:|---:|---:|
| Current example ($8.50 @ $4.75) | $0.546 | $3.20 | **37.7%** | $4.75 |
| **If live is $7.50 @ $4.75** | $0.517 | $2.23 | **29.8%** ⚠ | $4.75 |
| A) $9.99 @ $4.75 (price hike, same cadence) | $0.590 | $4.65 | **46.5%** | $4.75 |
| B) $9.99 @ $5.50 | $0.590 | $3.90 | **39.0%** | $5.50 |
| **C) $9.99 @ $5.75 (recommended)** | $0.590 | $3.65 | **36.5%** | $5.75 |
| D) $9.99 @ $6.00 | $0.590 | $3.40 | 34.0% ⚠ | $6.00 |

**Recommendation: $9.99 charge with threshold $5.75 (scenario C).**
- Keeps margin at **36.5%**, safely above the ≥35% floor.
- Each charge covers **$5.75** of COGS vs $4.75 today → **~21% fewer top-up events**,
  which means fewer fixed $0.30 Stripe fees, fewer card-decline moments, and a cleaner
  statement for the customer (better UX *and* better unit economics).
- The bigger, rounder $9.99 number reads as intentional rather than nickel-and-diming.
- Set `graceBufferUsd` to track the new charge ($9.99), same as today's "one charge"
  default.

If you'd rather maximize margin over cadence, scenario **A** ($9.99 @ $4.75) yields 46.5%
but charges just as often as today — a straight price increase. Scenario **B** is the
middle ground.

**All of this is env-only — no deploy required** (per `billing-config.ts`):

```
USAGE_TOPUP_CHARGE_USD=9.99
USAGE_TOPUP_THRESHOLD_USD=5.75   # scenario C
USAGE_GRACE_BUFFER_USD=9.99
```

⚠ **Legal/disclosure check before flipping:** the top-up amount is a customer-facing price.
Confirm `artifacts/instant-attorney/legal/05-billing-and-refund-disclosure.md` and any
in-product copy that names the top-up figure are updated in the same change.

---

## 5. UI / UX plan (top-of-the-line billing experience)

`BillingMeter.tsx` is solid but reads as a utilitarian admin strip. To make it "top of the
line," in priority order:

1. **Speak COGS in customer terms.** Users don't think in "$4.75 of model cost." Translate
   the cycle bar to something legible — e.g. "~N documents / messages until your next
   $9.99 top-up" — derived from a rolling average cost/action. Keep the exact dollars in a
   tooltip for transparency.
2. **One clear state at a time.** Today several banners can compute in sequence (near
   threshold, no card, exceeds limit, grace). Collapse to a single, prioritized status pill
   (ok / heads-up / action-needed) with one primary CTA.
3. **Make top-ups feel like a receipt, not a surprise.** After a successful auto top-up,
   show a small confirmed toast + a "Billing history" disclosure listing recent
   `top_up_charges` (date, $9.99, card last-4). This is the single biggest trust lever for
   auto-charging.
4. **Grace opt-in as reassurance, not fine print.** The "never interrupt a document"
   toggle is great; surface its *state* ("On — we'll finish work up to $9.99 and bill it
   next cycle") near the meter, not only in the settings row.
5. **Theme + polish.** Adopt the app's design tokens (the meter hardcodes hex colors),
   add dark-mode support, and animate the bar fill. Consider a compact "always-on" pill in
   the header that expands to the full card.
6. **Proactive, not reactive.** When `nextTopUpExceedsLimit` or `!hasPaymentMethod`, prompt
   *before* the block, not at it. A pre-emptive "add a card to avoid interruptions" nudge
   converts far better than a hard 402.

A visual mock of the redesigned meter can be produced as a follow-up artifact once the
copy/number-translation approach is chosen.

---

## 6. Prioritized action plan

### P0 — do now (margin correctness)
- [x] Meter `run_what_if` orchestrator tool (F1).
- [x] Meter grounded gov-form lookup + tag server-tool usage (F2).
- [ ] **Confirm the live `USAGE_TOPUP_CHARGE_USD` / `THRESHOLD_USD`** in the deployed env (F4).
- [ ] **Decide + set the $9.99 top-up** (recommend scenario C: `$9.99 @ $5.75`, grace `$9.99`),
      and update billing-disclosure copy in the same change (§4).

### P1 — near term (close exposure + blind spots)
- [ ] Extend `getBillingGate` to the ungated spend routes, especially Opus
      `attorney/documents/[id]/second-draft`; decide the attorney billing model (F3, F8).
- [ ] Make unknown-model pricing loud and/or default to the **Opus** rate (F5).
- [ ] Add a `server_tool_cost_usd` component to COGS (or a reconciliation job on the
      `web_search_requests` metadata this change records) (F6).
- [ ] Rate-limit / cap the public `/api/chat` surface (F7).

### P2 — experience (make it top-of-the-line)
- [ ] Redesign `BillingMeter` per §5: human-readable cycle, single-state pill, billing
      history/receipts, grace state surfaced, design-tokens + dark mode, proactive nudges.
- [ ] Add an `/admin` view that ties `usage_events` → `top_up_charges` → realized margin
      per user/cohort, so the ≥35% floor is monitored, not assumed.

---

## 7. What changed in this PR

- `lib/orchestrator-tools.ts` — `run_what_if` now records its Sonnet generation
  (`feature: "what_if"`, tagged as an orchestrator tool).
- `lib/gov-form-lookup.ts` — grounded lookups now attribute + record token usage
  (`feature: "gov_form_lookup"`), thread `userId`/`caseFileId`, and tag server-tool
  requests for later fee reconciliation. Recorder is lazily imported to keep pure helpers
  unit-testable.
- `lib/usage-tracker.ts` — added `gov_form_lookup` to `UsageFeature`.
- Typecheck clean; full test suite (616 tests) green.

_No pricing values were changed in code — the $9.99 move is an env + copy decision for you
to approve (§4)._
