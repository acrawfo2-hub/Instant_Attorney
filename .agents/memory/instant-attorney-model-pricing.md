---
name: AI model pricing coupling
description: Adding/swapping a Claude model in a route requires a matching usage-tracker pricing entry.
---

`lib/usage-tracker.ts` holds a `MODEL_PRICING_USD_PER_M` map and falls back to
`DEFAULT_MODEL_PRICING` (Sonnet's much cheaper rate) for any model not listed.

**Why:** the second-draft route was bumped to `claude-opus-4-8` but the pricing map
only had `claude-opus-4-6`, so every Opus second draft was silently costed at Sonnet
rates — a large undercount that corrupts the /admin usage dashboard.

**How to apply:** whenever a route's model constant changes or a new model is
introduced, add/verify its entry in `MODEL_PRICING_USD_PER_M` (and the per-model
ceiling in `lib/token-limits.ts`) in the same change. Opus tier ≈ input 15 / output 75
per 1M tokens.
