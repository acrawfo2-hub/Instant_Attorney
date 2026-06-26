# Design Proposal: The Roadmap as the Case File's Spine

**Status:** Proposal (no code yet)
**Author:** Instant Attorney engineering
**Related:** PR #32 (family-law specialty), `lib/family-roadmap.ts`, `lib/mission-control.ts`, `lib/next-step.ts`, `components/ClientFileView.tsx`

---

## 1. Problem & thesis

A case file in this app currently presents a *wall of parallel options*. A family
matter, for example, renders: the Family Roadmap, four estimator cards, the
What-If card, the document spotlight, the facts panel, fact gaps, attachments,
and government forms — all at once, all equally weighted. For a frightened
non-lawyer that is overwhelming. They don't know what to do first, so they freeze.

The app already answers "what's the next action?" (Mission Control's hero) and
"which documents do I need?" (NextStepGuide's document plan). It does **not**
answer the question the anxious user actually has:

> *"Where am I in this whole thing, and what does the road ahead look like?"*

The Family Roadmap shipped in PR #32 answers exactly that — for family law. **This
proposal generalizes it into the organizing spine of every case file**, using a
*hybrid* model (a generic arc for any matter + authored depth where it exists +
optional AI-emitted stages), and uses it to drive **progressive disclosure** of
the existing UI — collapsing complexity by default while keeping every current
option one click away.

The roadmap is not a new feature. It is an *ordering* of the features that already
exist.

---

## 2. Principles (hard constraints)

1. **Never remove, only collapse.** Everything visible today must remain reachable.
   Progressive disclosure hides nothing permanently: every collapsed section has a
   visible "Show all options" affordance, and the whole file has a global
   **"Show everything"** toggle that restores today's full view. The default is
   *guided*; one click is *everything*. (This is the explicit product requirement.)
2. **Additive, measured rollout.** The roadmap layers on top of the current view;
   we don't rip anything out. We collapse redundant surfaces only after the spine
   proves itself.
3. **Honest "you are here."** Stage completion is evidence-based, never narrative.
   A stage is "done" only on real signal; "current" is the first stage without
   one. This is already how `family-roadmap.ts` works and must hold for every area.
4. **General information, not advice.** A process map is safe ground (general legal
   information). No stage may assert a deadline or legal position it can't ground.
5. **Match the existing grain.** The codebase is *generic pipeline + per-area
   depth* (HOA instruments, family instruments, gov-form registry). The roadmap
   follows the same shape: generic spine + authored blueprints.

---

## 3. Concept: the roadmap as the spine

Today three "progress" concepts coexist and partly overlap:

| Concept | Module | What it answers |
|---|---|---|
| 5-step document stepper | `mission-control.ts` → `lf-stepper` | Where am I in the *document-production pipeline*? |
| Document plan roadmap | `next-step.ts` → `lf-roadmap` | *Which documents* do I need, in what order? |
| Family Law Roadmap | `family-roadmap.ts` (new) | Where am I in the *real-world legal matter*? |

The third is the missing one and the most meaningful to the user, because it's
about *their* journey, not the app's internals. The proposal: **the matter
roadmap becomes the top-level spine of the file.** Mission Control's hero becomes
"the one thing to do now *within the current stage*." The document plan stays, but
nested under the stage it belongs to (usually "Prepare your documents").

This removes the conceptual duplication: one spine, with the next-action and
document-plan concepts hanging off the *current stage* instead of floating beside it.

---

## 4. The hybrid model: three tiers of stage generation

A roadmap is an ordered list of stages. Stages can come from three sources,
resolved in priority order so every matter gets *something* good:

### Tier 1 — Generic matter arc (every file, derived; the fallback)
Derived purely from data the Living File already has. Works for *any* matter,
including the free-form "other" area, with zero authoring:

```
Understand your situation  →  Build your file  →  Prepare your documents
   →  Attorney review  →  Resolution / next steps
```

Each generic stage's completion is read from existing state:
- *Understand* — done once `matter_type` + `summary` exist.
- *Build your file* — current while fact gaps / requested attachments are open.
- *Prepare your documents* — driven by `legal_strategy.document_plan` and document statuses.
- *Attorney review* — a document is `pending_review` / `in_review`.
- *Resolution* — a document is `approved` / `delivered`, or a consult is booked.

This is essentially today's `lf-stepper`, promoted from a thin progress bar into a
real, tool-bearing spine.

### Tier 2 — Authored blueprints (depth where it exists)
Per-practice-area stage sets, hand-written for accuracy — exactly what
`family-roadmap.ts` is. Family ships now; **HOA is the obvious next** (it's the
other deep area): `notice received → cure or request a hearing → records request
→ demand / escalate → consult or litigation`. Employment, estate, and landlord
follow. A blueprint overrides the generic arc for its area.

### Tier 3 — AI-emitted stages (optional refinement)
The ACP intake already emits structured blocks (`---GOVERNMENT FORMS---`,
`DOCUMENT PLAN`, `---REQUESTED ATTACHMENTS---`). It can emit a **`---ROADMAP---`**
block that names the matter's stages, *constrained to a vetted vocabulary* the
same way gov-forms are constrained to real `form_key`s. This lets a nuanced or
unusual matter get a tailored arc without per-area code — but it is bounded:
the model selects/orders from known stage patterns, it does not invent steps or
deadlines.

**Resolution order:** authored blueprint (Tier 2) if the area has one → else
AI-emitted (Tier 3) if present and valid → else generic arc (Tier 1). All three
share one `RoadmapStage[]` shape and one completion engine.

---

## 5. Data model

```ts
// lib/roadmap.ts  (generalization of lib/family-roadmap.ts)

type StageStatus = "done" | "current" | "upcoming";

interface RoadmapStage {
  key: string;
  title: string;
  body: string;            // plain-language "what happens here / what to do"
  status: StageStatus;     // computed, evidence-based
  tip?: string;            // cost-conscious / practical
  tools?: ToolRef[];       // which existing surfaces belong to this stage (§7)
}

interface Roadmap {
  source: "blueprint" | "ai" | "generic";
  area: string;            // practice-area slug
  pathLabel: string;
  safety: boolean;         // safety banner (DV, etc.) when signalled
  safetyNote?: string;
  stages: RoadmapStage[];
  disclaimer: string;
}

interface RoadmapInput {
  matterText: string;                 // matter_subtype + summary
  area?: string;                      // practice-area slug if known
  facts?: string[];                   // confirmed-fact descriptions
  documents?: { title: string; status: string }[];
  govForms?: { title: string; status: string }[];
  requestedAttachments?: { status: string }[];
  emittedStages?: EmittedStage[];     // Tier 3, persisted from ---ROADMAP---
}
```

The completion engine (independent per-stage predicates over light signals) is
lifted directly from `family-roadmap.ts` and shared by all tiers. Persisted
AI-emitted stages live alongside the other Living File artifacts (a JSON column or
a small `roadmap_stages` store, mirroring `what_if_sessions`); **no change to the
document/billing/archival pipeline** — same discipline as everything in PR #32.

---

## 6. Progressive disclosure (the heart of the simplification)

The roadmap renders as the file's top section. Below it, the existing surfaces are
**grouped by the stage they serve** and **collapsed unless their stage is current**:

```
┌ Your Roadmap — Divorce ──────────────────────────────┐
│ ✓ Decide your path                                   │
│ ✓ File the petition                                  │
│ ● Parenting plan & support      ← YOU ARE HERE       │
│     [Child Support Estimator] [Possession Schedule]  │  ← revealed (current)
│     The one thing now: finish your support estimate →│  ← Mission Control hero
│ ○ Divide property & debts            Show options ▾  │  ← collapsed + escape hatch
│ ○ Mediation / settlement             Show options ▾  │
│ ○ Final decree                       Show options ▾  │
└──────────────────────────────────────────────────────┘
                                       Show everything ▾   ← global escape hatch
```

Rules that honor the "never remove" constraint:
- The **current** stage auto-expands its tools and shows the next-action hero.
- **Non-current** stages collapse their tools behind a per-stage **"Show options"**
  toggle — one click reveals them. Nothing is gone; it's folded.
- A global **"Show everything"** control restores today's full, flat view for
  power users or anyone who prefers it. This is a first-class control, not buried.
- Surfaces that don't map cleanly to a stage (the facts panel, raw attachments,
  the What-If game) live under a always-available **"Everything in this file"**
  expandable section, so the file is never *less* capable than today — only calmer
  by default.
- The disclosure state can persist as a per-user preference ("I always want it all
  expanded"), so we respect the user who tells us they prefer the full view.

This is the simplification thesis in one line: **same capabilities, sequenced
instead of stacked, with the full view always one click away.**

---

## 7. How tools attach to stages

Each existing surface declares which stage(s) it belongs to, so the reveal is
data-driven rather than hand-placed:

| Surface | Typical stage |
|---|---|
| Child-support / possession / maintenance estimators | "Parenting plan & support" |
| Property-division estimator | "Divide property & debts" |
| Document wizards (per `document_plan`) | "Prepare your documents" |
| Government forms | the stage that implies them (e.g. a move, a name change) |
| Requested attachments / fact gaps | "Build your file" |
| Consult booking | "Attorney review" / "Resolution" |
| What-If game | available at any stage (strategy) — lives in the always-on section |

For authored areas (family, HOA) the mapping is explicit in the blueprint. For the
generic arc, a default mapping keyed by surface type covers every matter.

---

## 8. Integration points

- **`components/ClientFileView.tsx`** — becomes roadmap-first; existing sections are
  wrapped in stage groups with collapse/expand. Today's order is preserved inside
  "Show everything."
- **`lib/mission-control.ts`** — the hero is reframed as "the one thing now within
  the current stage"; its ranked actions are filtered to the current stage by
  default and fully shown under "Show options." Mission Control keeps doing the
  ranking; the roadmap supplies the *context* it currently lacks.
- **`lib/next-step.ts`** — its `steps[]` (already `done`/`current`/`upcoming`) is
  reconciled into the roadmap so we have one stepper, not two.
- **Phase I (free-chat)** — a *preview* roadmap (educational, no progress tracking)
  shown with the free-chat summary, as a Phase II conversion bridge: "here's what
  handling this usually looks like, and where a privileged file + attorney help."
- **Attorney mode** — attorneys keep the full, flat view; the roadmap is primarily a
  client-orientation tool. (Today's `mode === "attorney"` branch is untouched.)

---

## 9. Guardrails (accuracy / honesty / UPL)

- Stage completion stays **evidence-based** (no narrative inference of progress).
- AI-emitted stages are **constrained to a vetted vocabulary**, never free-invented,
  and never carry a fabricated deadline — same rule as the gov-form registry.
- Every roadmap carries the **general-information disclaimer** and, where signalled,
  the **safety banner** (already implemented for family).
- "You are here" is described as a *map*, not a guarantee; steps can overlap/repeat.

---

## 10. Phasing

1. **Extract & generalize.** Promote `family-roadmap.ts` → `lib/roadmap.ts` with a
   blueprint registry + the shared completion engine. Family becomes the first
   registered blueprint. Pure refactor, fully testable, no UI change. *(Low risk.)*
2. **Generic arc.** Add the Tier-1 derived arc so *every* file gets a roadmap, not
   just family. Render it (read-only) at the top of `ClientFileView` behind a flag.
3. **Progressive disclosure.** Introduce stage grouping + collapse/expand + the
   global "Show everything" toggle. Measure overwhelm/engagement before collapsing
   anything by default.
4. **HOA blueprint.** Author the second deep area to prove the registry pattern.
5. **AI-emitted stages.** Add the `---ROADMAP---` intake block + persistence for
   nuanced matters.
6. **Mission Control / NextStepGuide reconciliation.** Fold the two existing
   steppers into the one spine.

Each phase is shippable and reversible on its own.

---

## 11. Non-goals & risks

- **Non-goal:** forcing a linear narrative on genuinely looping matters (litigation,
  appeals). Independent per-stage completion already avoids a false "X of N" march.
- **Non-goal:** removing any current capability. (See §2.1.)
- **Risk:** a wrong "you are here" misleads → mitigated by evidence-based completion
  + disclaimers.
- **Risk:** authoring cost per area → mitigated by the generic arc covering everything
  and blueprints being additive, not required.
- **Risk:** AI stage hallucination → mitigated by the constrained vocabulary.

---

## 12. Open questions for product

1. Should the disclosure default be **guided** (collapsed) or **everything** (flat) for
   a brand-new user, before we have engagement data?
2. Do we persist the user's expand/collapse preference per-user, per-matter, or both?
3. For Phase I, is the preview roadmap shown inline in chat, or on a dedicated
   "what happens next" panel after the summary?
4. Which areas get authored blueprints first after HOA — employment (the firm's
   primary) or estate (clean, linear, easy win)?
