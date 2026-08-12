# AI provider preference — roadmap

**Status:** Phase A implemented in code (draft). Do **not** offer Grok in production
until counsel approves updated agreements **and** ZDR is confirmed for both
Anthropic and xAI.

## Goals

1. Let clients prefer **Claude (Anthropic)** or **Grok (xAI)** for supported workhorse
   surfaces, with Claude remaining the default and full-capability path.
2. Meter usage as **provider COGS → USD → existing top-up ledger** (no second currency).
3. Keep architecture ready for a later **dual-model check** (one model drafts, the
   other audits assumptions/facts).

## Phase A (this change) — foundation + Living File intake

| Item | Detail |
|---|---|
| Preference | `profiles.preferred_ai_provider` (`anthropic` \| `xai`), default `anthropic` |
| UI | Account → “AI model preference” |
| Resolver | `lib/ai/models.ts` → `resolveModel({ tier, preference, … })` |
| Clients | `lib/ai/clients.ts` (Anthropic) + `lib/ai/xai-chat.ts` (xAI OpenAI-compatible stream) |
| Wired route | `/api/chat-acp` text-only **intake** uses Grok when preferred |
| Still Claude | Freestyle tools, attachments, Haiku/Opus jobs, wizard, what-if, attorney drafts |
| Pricing | `grok-4.5` in `MODEL_PRICING_USD_PER_M` ($2 / $6 per 1M; cached $0.30) |
| Legal | Docs 1, 2, 4, 8 + clickwrap `agreement-sign` bumped to **v2.1-draft** |
| Secret | `XAI_API_KEY` (see below) |

**Capability rule:** if a turn needs Anthropic-only features (server web tools,
PDF/document blocks, freestyle orchestrator tools in Phase A), `resolveModel`
falls back to Claude for that turn even when the user prefers Grok.

## Where to put `XAI_API_KEY`

| Environment | Where |
|---|---|
| **Local / Replit** | `artifacts/instant-attorney/.env.local` (gitignored). Copy from repo-root `.env.local.example`. |
| **Vercel (preview + production)** | Project → Settings → Environment Variables → add `XAI_API_KEY` as a **secret** for Preview and Production (and Development if you use `vercel env pull`). |
| **Optional flags** | `XAI_ZDR_CONFIRMED=true` / `NEXT_PUBLIC_XAI_ZDR_CONFIRMED=true` only after xAI ZDR is live; `XAI_PROVIDER_ENABLED=true` to force-offer Grok in production before the ZDR flag (staging only). |

Anthropic remains `Claude_Instant_Attorney` (with `ANTHROPIC_API_KEY` as fallback in the new client factory).

**Do not** commit the key. **Do not** prefix it with `NEXT_PUBLIC_`.

## ZDR — how hard is dual-provider?

**Not unusually hard, but it is two vendor processes — not one checkbox.**

| Provider | Path |
|---|---|
| **Anthropic** | Existing plan: enable ZDR / zero retention on the Instant Attorney org/workspace, then set `ANTHROPIC_ZDR_CONFIRMED=true`. |
| **xAI** | ZDR is a **team-wide** Console setting (Enterprise Terms). Admins enable it under Team Settings → Zero Data Retention when self-serve is available; otherwise email `sales@x.ai`. Confirm via Console badge and response header `x-zero-data-retention: true`. ZDR disables xAI features that need stored state (Batch, Files/Collections, stateful Responses) — Instant Attorney’s Phase A chat path does not need those. |

**Practical sequence before go-live with the toggle:**

1. Finish Anthropic ZDR (already a launch prerequisite).
2. Create an xAI team / API key used **only** for this product.
3. Enable xAI ZDR on that team; verify the response header on a test call.
4. Set `XAI_API_KEY`, `XAI_ZDR_CONFIRMED`, and public flag; counsel-approve v2.1 agreements.
5. Re-consent existing Phase II users who signed v2.0 single-provider language (product work: soft gate until they accept v2.1).

Difficulty is mostly **ops + counsel**, not engineering. Expect sales/legal back-and-forth on xAI if self-serve ZDR is not visible on the account.

## Will pricing / what users pay change?

**Customer-facing top-up price does not have to change for Phase A.**

- Meter still charges when cumulative **model COGS** hits the threshold (default $4.75 → $8.50 charge, ~35–50% margin band).
- Grok 4.5 list rates (~$2/$6 per 1M) are lower than Sonnet (~$3/$15), so the same conversation usually accrues **less COGS** → users hit top-ups **less often** (their savings).
- Firm margin stays inside the existing band because the charge and threshold are unchanged; cheaper COGS simply burns slower.
- “50% margins on Grok” can be a later policy tweak (per-provider threshold or a Grok-specific multiplier) — not required for Phase A.
- Watch xAI **long-context** pricing (≥200k prompt tokens doubles rates) and any enterprise discount from sales; update `MODEL_PRICING_USD_PER_M` when contracts differ from list.

Subscription ($9.99) and consult ($49.99) are unchanged by this feature.

## Phase B — widen workhorse coverage

- Wire `resolveModel` into **wizard** and **what-if** text paths.
- OpenAI-compatible **tool calling** for freestyle orchestrator tools on Grok (still no Anthropic server web tools).
- Image attachments on Grok where supported; keep PDF/document blocks on Anthropic.
- Account UI copy that explains automatic Claude fallback for capability-bound turns.
- Admin dashboard: break out usage by `provider` / model.

## Phase C — Anthropic-only capabilities parity or clear limits

- Decide product policy: rebuild web search/fetch on xAI tools **or** permanently keep research paths on Claude.
- Gov-form lookup / attorney authorities: keep Claude unless xAI search quality is validated.
- Prompt-cache economics: optional xAI cached-input tuning once traffic exists.

## Phase D — dual-model check (cross-audit)

Once both providers are reliable and metered:

1. Primary model (user preference) produces the answer / draft.
2. Auditor model (the other provider) returns structured JSON: assumptions, citations, disagreements, confidence.
3. UI surfaces conflicts; attorney review remains authoritative.
4. Meter **both** calls; consider running the auditor only on high-stakes features (strategy, demand letters) to control cost.

Suggested first dual-check surface: Living File **legal strategy** block or wizard final draft — not every chat turn.

## Launch checklist

- [ ] Apply `supabase/schema-stage46-preferred-ai-provider.sql`
- [ ] Set `XAI_API_KEY` in Vercel + local `.env.local`
- [ ] Anthropic ZDR confirmed + env flags
- [ ] xAI ZDR confirmed + env flags
- [ ] Counsel approves v2.1 legal / clickwrap; set effective dates
- [ ] Re-consent flow for existing subscribers
- [ ] Staging QA: preference toggle, intake on Grok, freestyle still Claude, usage_events model ids
- [ ] Confirm top-up margin still in band with mixed traffic
