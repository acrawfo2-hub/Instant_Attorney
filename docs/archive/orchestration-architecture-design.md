# Design Note: Orchestration over Rails — the Ontology and the Critic

**Status:** Architecture proposal (no code yet). Frames two structural investments
implied by the shift from rails to orchestration.
**Author:** Instant Attorney engineering
**Related:** `lib/acp-area-router.ts` (dynamic module routing — the first orchestration
primitive), `lib/prompts.ts` (`buildFileContext`, `ACP_CHAT_SYSTEM_PROMPT`,
`LIVING_FILE_EXTRACTOR_SYSTEM`, `DRAFTER_SYSTEM_PROMPT`, `DOC_REVIEW_SYSTEM_PROMPT`,
`DOCUMENT_TYPE_FITNESS_SYSTEM_PROMPT`, `BRAINSTORM_SYSTEM_PROMPT`), the per-area
catalogs (`*-statutes.ts`, `*-instruments.ts`, `*-roadmap.ts`, `*-assessment.ts`),
`docs/provability-lens-design.md`, `docs/roadmap-design-proposal.md`.

---

## 1. The insight

We are moving the case-preparation flow from **rails** (authored wizards, fixed
steppers, per-area pipelines) to **orchestration** (a coordinating layer that decides
at runtime which specialists, knowledge modules, and tools to invoke). `acp-area-router.ts`
is already this: instead of a pre-set practice-area path, it detects the area(s) a
conversation implicates and loads only the relevant deep-dive modules, degrading
gracefully when nothing matches.

The non-obvious consequence: **rails were never just a UX pattern — they were our safety
system.** On rails, the author of the flow *is* the QA and *is* the world-model. A wizard
can only emit documents it was designed to emit; the person who wrote the flow already
vetted every path and already fixed what "reality" the flow operates in. Bounded paths →
bounded failure modes.

Orchestration removes the track. That is the whole point (it handles the long tail of real
matters no finite set of wizards ever could) **and** the whole danger (the system can now
produce paths and outputs no human pre-authorized). So the two questions that surface the
moment we go orchestration-first are not incidental features — they are the two guarantees
we just gave up and must rebuild explicitly:

- An **ontology** — how the specialists agree on *what reality is* (and what the critic
  checks against).
- A **critic / QA role** — how emergent output *earns the right to be shown*.

This note argues we already have embryonic versions of both, and proposes the **thin** shape
each should take. The governing principle throughout: swap authored-path safety for a
world-model plus a judge — build neither bigger than the orchestration's pain demands.

---

## 2. Principles (hard constraints)

1. **Pain-driven, not purity-driven.** Do not build a grand ontology or a universal critic
   up front — that is rails-thinking applied to the data model. Promote structure only where
   orchestration is already tripping.
2. **Match the existing grain.** The codebase is *generic pipeline + per-area authored depth*
   (statutes, instruments, roadmaps, gov-form registry). Both the ontology and the critic
   follow the same shape: a thin generic core + per-area authored depth.
3. **Internal precision, client-facing information.** Structure grounds the AI and the
   attorney; it never converts our client-facing framing from *general information* into
   *legal conclusions*. (See §5.)
4. **Independence for the critic.** Verification must never be the drafter grading its own
   homework.
5. **Grounded verdicts only.** A critic that cannot cite what it checked against is worse
   than none — it launders risk into a false "looks fine."
6. **Orchestrate the map, rail the dangerous intersections.** Orchestration is for discovery
   and drafting; rails remain correct for fixed, high-stakes, auditable execution.

---

## 3. The ontology layer

"Ontology" here is **not** a formal legal knowledge-modeling project (LKIF-style efforts are
a career-swallowing swamp — explicitly out of scope). Two distinct things hide under the word;
keep them separate.

### 3.1 Coordination ontology — shared vocabulary across agents

On rails, each wizard owned its own slots and agents barely interacted. Under orchestration,
the extractor, drafter, reviewer, roadmap, and What-If all read and write the **same** Living
File. If they don't share definitions of "established vs. asserted," "fact vs. hypothetical,"
or "stage complete," they silently disagree and the file rots.

**We already have this**, informally. The provability-lens taxonomy is described in its own
doc as "shared by AI, client, and attorney," and `buildFileContext` injects a legend so every
downstream agent reads the tags the same way. Today it rides *inside the fact text as prose*
(the `[established — …]` / `What-if · ` convention).

**Proposal:** promote it from prose-in-prompts to a **thin typed layer**, but only where
orchestration is already tripping. The trigger conditions:
- two agents demonstrably interpret a tag differently, or
- we cannot answer a structured question ("show me all *asserted* facts") without an LLM
  re-reading everything.

This is exactly the provability-lens **Tier 1** (`support` column: `established | asserted |
opinion`, with graceful fallback). Ship that first. Let the rest of the coordination ontology
crystallize the same way — one column at a time, driven by a concrete coordination failure.

### 3.2 Domain ontology — the Proof Map (grounding, not coordination)

Distinct from vocabulary: a queryable model of **claim → elements → required evidence →
instrument → statute**. The raw material already exists, scattered across `defamation-statutes.ts`,
`employment-instruments.ts`, `bankruptcy-means-test.ts`, and siblings, plus the provability
lens's own **Tier 2 "Proof Map"** (each claim element → its evidence → a strength flag).

Build the **thin** version: per claim type, its elements; per element, the evidence categories
that establish it. That is a catalog in the grain we already work in — not an ontology project.

**Why this is the highest-leverage structure in the system:** the domain ontology and the critic
are *the same investment*. You cannot rigorously QA a legal draft without a machine-checkable
model of what a claim requires. The Proof Map is what turns the critic from a vibes-check into a
grounded gate (§4.2).

Sketch of the thin shape (illustrative, not final):

```ts
// per practice area, authored — the generic engine consumes these uniformly
interface ClaimElement {
  id: string;                 // "publication", "falsity", "damages"
  label: string;              // human-facing
  evidence: EvidenceCategory[]; // categories that establish this element
}
interface ClaimBlueprint {
  claimType: string;          // "defamation-per-se"
  jurisdiction?: string;      // where element sets differ
  elements: ClaimElement[];
}
// EvidenceCategory reuses the provability vocabulary: document | message | record |
// witness | recollection — the same axis the `support` column encodes.
```

The Proof Map view (client "what you can prove" / attorney "proof map") the provability doc
already envisions becomes a *read* of this structure joined against the Living File.

---

## 4. The critic / QA role

We already have **three** critics: `DOC_REVIEW_SYSTEM_PROMPT` (senior-attorney review memo that
drives the second draft), `DOCUMENT_TYPE_FITNESS_SYSTEM_PROMPT` (pre-draft fitness check), and
`BRAINSTORM_SYSTEM_PROMPT` (candid associate that pushes back). So the question is not "do we need
one" — it is whether adversarial verification becomes a **first-class role in the orchestration**
rather than a stage buried in the drafting pipeline.

**Yes — it is the load-bearing wall that lets us take the rails off.** It is not a feature; it is
the safety we traded away, bought back.

### 4.1 Two critics, not one

There are two QA needs, and they *conflict if merged* — a single "make it good" critic optimizes
mush:

- **Legal-correctness critic.** Does every factual assertion trace to an established/asserted fact?
  Is any characterization stated as fact (the drafter already forbids this; the critic *enforces*
  it)? Are all claim elements addressed? Is the jurisdiction/statute current? Is the
  general-information / UPL line held?
- **Fitness / altitude critic.** Right document type? Right tone — not over-lawyered for a
  frightened layperson? `DOCUMENT_TYPE_FITNESS_SYSTEM_PROMPT` is already its seed.

Keep them separate roles.

### 4.2 Design rules

1. **Independence.** Fresh context, ideally a different model, seeing only the *output* + the
   *ground truth* (Living File, Proof Map) — never the drafter's reasoning. Its job is to find the
   reason the output is *wrong or unsupported*, not to polish.
2. **Grounded verdicts.** The legal-correctness critic checks against the Proof Map (§3.2) and the
   provability tags (§3.1). This is why the ontology and the critic are one investment.
3. **A real STOP verdict.** It must distinguish "do not send" from "could be tighter." A
   traffic-light verdict + reasons beats a wall of memo prose.

### 4.3 Automatic internal gate vs. manual attorney review

Today, attorney review is **manual-only** by deliberate design (`instant-attorney-manual-review.md`:
the attorney clicks *Run Critical Review*; no auto-trigger). Under orchestration, split the two
concerns rather than collapsing them:

- **Automatic internal gate** — the system critiques its *own* emergent output before it ever
  reaches a client-facing surface. This protects the surface and is the direct replacement for the
  vetting the rail author used to do.
- **Manual attorney review** — unchanged human-in-the-loop for liability and accountability.

These are not the same click and should not be. The internal gate is about output quality; the
attorney review is about professional responsibility. (This proposal does **not** re-add an
auto-trigger to the *attorney* review — the internal gate is a separate, pre-attorney step.)

---

## 5. Guardrails (accuracy / honesty / UPL)

- **The ontology stays internal.** The more machine-precise the claim model, the more it reads as a
  legal *conclusion* rather than general information. Structure grounds the AI and the attorney; the
  client-facing framing remains *"what evidence supports this,"* never *"legally proven"* — the exact
  posture the provability-lens doc already sets.
- **Critic verdicts are internal signals**, not advice emitted to the client. A STOP means "don't
  present this," not "you have no case."
- **No fabricated certainty.** Element sets and evidence categories are authored and vetted (same
  rule as the gov-form registry and roadmap vocabulary); the critic never invents an element,
  deadline, or citation.
- **Provability ≠ doubt.** "Asserted" frames *"let's get this provable,"* never *"we don't believe
  you"* — carried through from the provability lens.

---

## 6. Why it generalizes

The pattern is area-agnostic because it reuses the grain we already have:
- **Employment:** pretext claim → elements → the email vs. the belief (Proof Map + provability tags).
- **Defamation:** provably-false statement of fact → the recording vs. the characterization.
- **Contracts:** breach → what's in writing vs. an oral side-promise.
- **Debt (defensive):** does the *collector* have provable ownership → chain-of-title evidence.

Each is a `ClaimBlueprint` the generic critic consumes uniformly.

---

## 7. Phasing

Each phase is shippable and reversible on its own.

1. **Coordination ontology, Tier 1.** Add the provability `support` column with graceful fallback;
   have `buildFileContext` group by it. Pain-driven promotion of what already rides in prose.
   *(Low risk; already scoped in the provability doc.)*
2. **Thin Proof Map for one area.** Author `ClaimBlueprint`s for the firm's primary area (employment)
   as pure data + a generic read joined against the Living File. Fully unit-testable, no UI change.
3. **Legal-correctness critic (internal gate) for that area.** Independent role grounded in #2, with a
   traffic-light STOP verdict, run before the client-facing surface. Consolidates the grounding half
   of `DOC_REVIEW`.
4. **Fitness critic as a distinct role.** Promote `DOCUMENT_TYPE_FITNESS` into a standalone altitude
   check separate from legal correctness.
5. **Proof Map surfaces.** Ship the client "what you can prove" and attorney "proof map" views
   (provability Tier 2) as reads of #2.
6. **Generalize.** Add `ClaimBlueprint`s per additional area; the generic critic + Proof Map absorb
   each with no new machinery.

---

## 8. Non-goals & risks

- **Non-goal:** a formal, exhaustive legal ontology. We build the thin element→evidence catalog only.
- **Non-goal:** replacing rails everywhere. Rails remain correct for fixed, high-stakes, auditable
  execution (signature flows, filing sequences, statutory deadlines). The mature architecture is
  *orchestration for discovery and drafting over rails for execution and compliance* — the same
  hybrid instinct as the roadmap-as-spine proposal (generic authored arc + AI-emitted stages).
- **Non-goal:** re-adding an auto-trigger to the *attorney* review. The internal gate is separate.
- **Risk:** the critic laundering risk with a shallow pass → mitigated by grounding every verdict in
  the Proof Map and provability tags (§4.2), not free judgment.
- **Risk:** ontology certainty leaking to the client as advice → mitigated by keeping it internal (§5).
- **Risk:** authoring cost per area → mitigated by the generic engine + additive, not required,
  per-area blueprints (same economics as the roadmap registry).

---

## 9. Open questions for product

1. Does the internal gate **hard-block** a client-facing output on STOP, or downgrade it to a clearly
   flagged draft the client can still see?
2. Is the fitness critic run on *every* generation, or only above a complexity/stakes threshold
   (cost vs. coverage)?
3. Which area gets the first `ClaimBlueprint` after employment — defamation (the cleanest
   elements→evidence mapping) or debt (highest defensive value)?
4. Do we expose the critic's reasoning to the *attorney* (as a review aid), or keep it a silent gate?
