# Design Note: The Provability Lens (Established vs. Asserted vs. Opinion)

**Status:** Tier 0 implemented (prompt-only); Tier 1–2 deferred.
**Related:** `lib/prompts.ts` (ACP intake, `buildFileContext`, drafter, pre-consult memo), `lib/defamation-assessment.ts`, `fact_items` (`kind`/`status`).

---

## The insight

Defamation forced the distinction "provably false statement of **fact**" vs. protected opinion — but that distinction is **universal**, not defamation-specific. Every matter turns on what can actually be *proven*.

Today the Living File tracks two fact axes:
- `status`: `confirmed` vs. `gap` — *known vs. unknown.*
- `kind`: `fact` vs. `hypothetical` — *real facts vs. What-If intentions.*

The missing axis is the one a litigator lives in: **of what we "know," what can we prove?** A confirmed fact may be a signed contract or pure he-said/she-said, and the file treats them identically. This note adds a *provability lens* without an overhaul.

## The taxonomy (shared by AI, client, and attorney)

Split **confirmed facts** into three:
- **Established** — backed by tangible evidence in the file or readily obtainable (document, message, photo, recording, third-party record).
- **Asserted** — likely true but resting on the client's account for now; provable in principle, proof not yet in hand.
- **Characterization / opinion** — not a provable fact ("hostile," "unfair," "lazy"); little evidentiary weight, and in defamation often protected.

Alongside the existing **Gap** (unknown) and **Intention** (hypothetical), this is a complete, intuitive model. The reflex it installs in intake is one question: *"How would we show that — a document, a message, a witness, or your recollection?"*

## Tiered plan

**Tier 0 — prompt-only (this PR). No schema, no UI, reversible.**
The provability tag rides *inside the fact text* the AI writes (the same convention as the existing `What-if · ` prefix), so it flows everywhere `buildFileContext` is consumed — drafter, memo, What-If — with zero plumbing.
1. **Intake (`ACP_CHAT_SYSTEM_PROMPT`)** — a "proof lens": for *material* facts only (keep it warm, not a deposition), establish how each could be shown, tag each confirmed fact `[established — …]` / `[asserted — client's account]` / `[characterization/opinion]`, and when a key fact is only asserted, request the document that would establish it via the existing `---REQUESTED ATTACHMENTS---` block.
2. **`buildFileContext`** — a one-line legend so every downstream agent interprets the inline tags and weights facts accordingly.
3. **Drafter (`DRAFTER_SYSTEM_PROMPT`, `SECOND_DRAFT_SYSTEM_PROMPT`)** — state established facts plainly; hedge asserted ones ("the client states," "on or about"); never assert a characterization as fact.
4. **Attorney memo (`buildPreConsultPrompt`)** — a `PROOF & EVIDENCE` section: what's established, what's merely asserted, and what evidence to gather.

**Tier 1 — light, optional persistence (deferred).**
Mirror the `fact_items.kind` precedent: an optional `support` column (`'established' | 'asserted' | 'opinion'`) with graceful fallback, set by the AI, grouped by `buildFileContext`; plus linking a fact to the attachment that proves it.

**Tier 2 — cards (deferred).**
- *Client:* a "What you can prove" view splitting key facts into *backed by evidence* vs. *your word so far — let's find proof*, nudging an upload.
- *Attorney:* a "Proof Map": each claim element → its evidence → a strength flag.

## Why it generalizes
- **Employment:** "the reason was pretextual" — the email vs. the belief.
- **Contracts:** what's in writing vs. an oral side-promise.
- **HOA:** "they singled me out" — the notice + comparable un-enforced violations.
- **Debt (defensive):** does the *collector* have provable ownership of the debt?

## Guardrails
- **Don't overclaim.** Frame as *"what evidence supports this,"* never *"legally proven."* Provability is a spectrum and a legal judgment; keep the general-information framing.
- **Selective + warm.** Apply only to load-bearing facts, or intake feels like cross-examination.
- **"Asserted" ≠ "doubted."** The client is believed; the framing is *"let's get this provable."*

## Where we started
Tier 0, prompt-only — ~80% of the value, no schema/UI risk, measurable and reversible. Tier 1's optional `support` tag is the natural follow-up once it proves out.
