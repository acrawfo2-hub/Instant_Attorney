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
- **FIXED — margin floor is now self-enforcing.** Rather than trusting a hand-set
  threshold that can drift out of range (at a $7.50 charge, the old $4.75 threshold was
  only ~29.8%), the trigger threshold is now **clamped into a 35–50% margin band** for
  whatever the live charge is. The **price is unchanged**; the threshold moves to protect
  margin.

### Decisions locked in (2026-07-28)

- **Top-up price: unchanged.** No change to `USAGE_TOPUP_CHARGE_USD`.
- **Threshold: auto-maintained at 35–50% margin.** Implemented as a clamp in
  `getBillingConfig` (see §4). At the committed $8.50 charge nothing changes (37.7%); at a
  lower live charge the threshold self-corrects up to the floor edge.
- **Monthly auto-charge default: $25/mo — unchanged** (`USAGE_DEFAULT_MONTHLY_TOPUP_LIMIT_USD=25`,
  already the default).
- **Attorney usage: metered against the consumer ledger** (no exemption). This is now
  confirmed intended behavior — see F8.

The remaining findings (gate coverage, uncosted web-search server-tool fees, UI polish)
are laid out with a prioritized plan in §6.

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

### F4 — Config drift: is the live charge $7.50 or $8.50?  ·  Severity: HIGH (margin)  ·  **RESOLVED STRUCTURALLY**
`.env.local.example` and the `getBillingConfig` default say **$8.50 @ $4.75** (≈37.7%),
but the live charge may be **$7.50**, at which $4.75 is only ~29.8% — below the ≥35% floor.
Rather than depend on knowing the exact live number, `getBillingConfig` now **clamps the
threshold into the 35–50% margin band for the actual charge** (`clampThresholdToMarginBand`).
So whether the charge is $7.50 or $8.50, realized margin stays in band; at $8.50 the
existing $4.75 is untouched. It still logs a warning when it adjusts, so the drift stays
visible. **Residual action:** confirm the live `USAGE_TOPUP_CHARGE_USD` so you know which
end of the band you're operating at (informational now, not a margin risk).

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

### F8 — Attorney work meters against the consumer top-up ledger  ·  **DECIDED: intended**
`attorney/*` AI usage accrues to the same `top_up_ledger`. **This is the intended model** —
attorneys are metered against the consumer ledger just like clients. Verified: no code path
auto-sets attorneys `billing_exempt` (the flag is a manual per-profile override only), and
all seven attorney AI routes call `recordAiUsage`, so attorney spend is fully metered
today. **Follow-on (P1):** because attorney routes are billable, they should also get the
pre-call `getBillingGate` (see F3) so a blocked attorney is stopped the same way a blocked
client is — especially on the Opus second-draft route.

### F9 — Healthy things worth keeping (verified)
- Prompt-cache write (×1.25) / read (×0.1) pricing is correct.
- Idempotency is genuinely 3-layered (ledger claim, unique `top_up_charges` row, Stripe
  idempotency key) and the webhook dedupes on event id.
- Completion-grace math is bounded and never forgives COGS (collected next cycle).
- Overshoot carry-forward keeps steady-state margin stable.

---

## 4. Pricing: price held; threshold self-maintains 35–50% margin

**Decision: the top-up price stays as configured; the threshold is the lever.** Stripe US
card fee = **2.9% + $0.30**. Steady-state margin = `(charge − threshold − fee) / charge`
(carry-forward makes one charge ⇔ `threshold` of COGS).

`getBillingConfig` now clamps the configured threshold into the **35–50% band** for the
live charge (`clampThresholdToMarginBand`), so margin holds regardless of the exact price:

| Live charge | Allowed threshold band (50%→35%) | Old $4.75 threshold | After clamp |
|---|---|---:|---|
| $8.50 | $3.70 – $4.98 | 37.7% ✓ in band | **$4.75 unchanged** |
| $7.50 | $3.23 – $4.36 | 29.8% ⚠ below floor | **→ $4.36 (≈35%)** |

Properties:
- An **in-band** explicit threshold is respected exactly (no surprise change at $8.50).
- An **out-of-band** one is pulled only to the nearest boundary — never past it — and a
  warning is logged so the adjustment is visible in logs.
- Works for any future price change without re-tuning the threshold by hand.

If you later want to bias toward the *middle* of the band (~42%) instead of "respect an
in-band value, clamp an out-of-band one," that's a one-line change to target a fixed
margin via `thresholdForMargin(charge, 0.42)`. Left as clamp-to-band so an operator's
explicit in-band choice is honored.

_No customer-facing price value changed, so no billing-disclosure copy change is required
by this PR. If you ever do move the price, update
`artifacts/instant-attorney/legal/05-billing-and-refund-disclosure.md` and in-product copy
in the same change._

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
- [x] **Self-maintaining threshold** — clamp into the 35–50% margin band; price unchanged (F4).
- [x] **Attorney usage metered on the consumer ledger** — confirmed intended; no exemption (F8).
- [x] **$25/mo auto-charge default** — confirmed unchanged.
- [ ] _Informational:_ confirm the live `USAGE_TOPUP_CHARGE_USD` so you know which end of the
      band you're operating at (no longer a margin risk).

### P1 — near term (close exposure + blind spots)
- [ ] Extend `getBillingGate` to the ungated spend routes, especially Opus
      `attorney/documents/[id]/second-draft` (attorneys are billable, so they should be
      gated like clients) (F3, F8).
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
- `lib/billing-config.ts` — added `stripeFeeUsd`, `thresholdForMargin`, and
  `clampThresholdToMarginBand`; `getBillingConfig` now clamps the trigger threshold into
  the 35–50% margin band for the live charge (price untouched) and warns when it adjusts.
- `lib/billing-config.test.ts` — new tests locking the margin-band invariant.
- Typecheck clean; full test suite (623 tests) green.

_No customer-facing price value was changed. The threshold is now self-maintaining within
35–50% margin; the $25/mo default and attorney-metering behavior are confirmed as-is._
