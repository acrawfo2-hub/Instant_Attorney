# Financial Picture — Spec for Asset-Dependent Matters

**Status:** Draft for review
**Scope:** Family law, bankruptcy, estate planning (any matter whose strategy or documents depend on the client's — or a partner's — assets, debts, income, or property characterization)
**Author:** Instant-Attorney / Crawford Law PLLC

---

## 1. Purpose

Asset-dependent matters are where this app's value and its risk concentrate. The strategy turns on a **complete, correctly characterized, and verified** financial picture, and the data involved is the most sensitive we touch and the most likely to be adversarial or fraud-adjacent. This spec defines a structured **Financial Picture** layer that:

1. Captures assets/debts/income with the metadata needed to *characterize* and *verify* them (not just enumerate them).
2. Handles the **partner** correctly across three very different relationships (adverse party, joint client, non-client third party).
3. Keeps collection inside privilege (Phase II) and **never assists concealment**.
4. Minimizes and secures sensitive PII.
5. Routes everything through deterministic math and **attorney verification before any sworn filing**.

### Design principle (the one thing to get right)

Every financial fact carries **three metadata axes**, and those axes drive the UI, the math, the privilege handling, and the attorney's verification queue:

| Axis | Question | Why it matters |
|---|---|---|
| **Ownership + relationship** | Whose asset is it, and what is the firm's relationship to that person? | Conflicts, privilege, what we may collect |
| **Provenance + verification** | Where did the number come from, and is it confirmed? | Accuracy; sworn-filing integrity; malpractice exposure |
| **Phase + privilege** | What ACP phase was it collected under? | Privilege protection; data handling |

Most accuracy, ethics, and privacy concerns collapse into getting this metadata right.

---

## 2. Builds on existing architecture

This is an extension of the current model, not a parallel system.

- **`fact_items`** — today: `{ description, status: confirmed|gap, kind: fact|hypothetical }`, RLS-scoped to case owner, written via service-role. The Financial Picture adds a **typed, structured sibling table** for financial records; narrative facts continue to live in `fact_items`.
- **`attachments`** — already store uploaded docs with `ai_summary`, `key_sections`, processing status. Financial items **link to a source attachment** for document grounding.
- **ACP phases** — Phase I (free, *not* privileged) vs Phase II (privileged after signing + subscription) already exist. Financial intake is **gated to Phase II**.
- **Deterministic calculators** — means test, property division, support, probate-vs-trust estimator are already pure code. They become the **only** thing that computes over financial items.
- **Attorney review pipeline** — already gates document delivery. We add a **financial verification queue** and a **sworn-filing gate** on top of it.

---

## 3. Data model

### 3.1 Case-level: representation context (NEW — drives everything)

Add to `case_files` (or a `matter_representation` row):

```
representation_scope    enum: single_client | joint_spouses
                        -- estate planning may represent both spouses; family law never does
partner_role            enum: none | adverse_party | joint_client | non_client_third_party
partner_consented       boolean   -- did the partner sign an engagement / disclosure consent?
joint_no_secrets_ack    boolean   -- for joint_spouses: both acknowledged no-secrets representation
```

**Rules enforced from this context:**
- `family_law` ⇒ `partner_role` may be `adverse_party` or `non_client_third_party`; **never** `joint_client`.
- `estate_planning` + `joint_spouses` ⇒ require `joint_no_secrets_ack = true` before collecting either spouse's confidential finances (Tex. Disciplinary R. 1.06/1.07).
- A `partner` who is `adverse_party` or `non_client_third_party` ⇒ their financial items are **always** `provenance = client_asserted` and may **never** be marked `attorney_verified` from client input alone.

### 3.2 `financial_items` (NEW table)

```
id                   uuid pk
case_file_id         uuid fk case_files       -- RLS-scoped, mirrors fact_items
user_id              uuid fk profiles         -- the CLIENT (record owner), never the partner
created_at, updated_at

-- WHAT --------------------------------------------------------------
category             enum: real_property | vehicle | financial_account | retirement_account
                         | business_interest | personal_property | life_insurance | receivable
                         | secured_debt | unsecured_debt | income_source | recurring_expense
label                text                     -- minimized, e.g. "Chase checking ••4321"
acquisition_note     text                     -- WHEN/HOW acquired + with what funds (tracing)

-- AXIS 1: OWNERSHIP + RELATIONSHIP -----------------------------------
owner                enum: client | partner | joint | other_third_party
characterization     enum: community | separate_client | separate_partner
                         | mixed_or_unknown | not_applicable    -- TX community-property axis
exempt_status        enum: exempt | non_exempt | partial | unknown | not_applicable  -- bankruptcy axis

-- VALUE (ranges, not false precision) --------------------------------
value_low            numeric
value_high           numeric
value_basis          enum: client_estimate | account_statement | appraisal
                         | tax_assessment | contract_or_title | other_document
valued_as_of         date

-- AXIS 2: PROVENANCE + VERIFICATION ----------------------------------
provenance           enum: client_asserted | document_extracted | attorney_verified
verification_status  enum: unverified | doc_supported | attorney_verified
source_attachment_id uuid fk attachments null -- grounding doc for the figure

-- AXIS 3: PHASE + PRIVILEGE ------------------------------------------
phase_collected      enum: phase_1_unprivileged | phase_2_privileged
privileged           boolean

-- INTEGRITY / WORKFLOW ----------------------------------------------
red_flags            jsonb                    -- detector output (see §7), [] if clean
needs_attorney_review boolean
status               enum: active | superseded | removed
superseded_by        uuid null                -- versioning; never hard-delete sworn-relevant history
```

**RLS:** identical ownership pattern to the hardened `fact_items` policy — `auth.uid() = user_id AND case ownership via EXISTS`, with `WITH CHECK`. App writes via service-role.

### 3.3 Sensitive identifiers — store late, store apart, or not at all

Raw identifiers (full account numbers, SSNs, routing numbers) are **not** stored in `financial_items`. Default to **not collecting them** until a filing requires them (§6.4). When required:

```
financial_secure_ref (NEW, isolated table)
  id, financial_item_id fk, kind enum: ssn | account_no | routing_no | policy_no
  ciphertext           -- envelope-encrypted; app-layer encryption above Supabase at-rest
  created_at
  -- NO ai access: never read into a model prompt; attorney/drafting access only at filing
```

`label` always shows a **redacted** form (`••4321`). The raw value is fetched only by the document generator at filing time, server-side, never sent to the LLM.

---

## 4. The partner problem (conflicts + privilege, not just data)

The representation context (§3.1) makes the app *know which world it is in* before collecting anything about a partner.

| Relationship | Who they are | What we collect | Provenance ceiling | Privilege |
|---|---|---|---|---|
| **Adverse party** (family law) | Opposing spouse | Only what the *client* knows; clearly labeled "client-reported" | `client_asserted` (never verified from client input) | Client's report is privileged; the partner has **no** privilege with us |
| **Joint client** (estate planning, both spouses) | Co-client | Both spouses' finances, under no-secrets consent | Either spouse's input, verifiable | Joint privilege; **no secrets between co-clients** |
| **Non-client third party** | A partner who isn't a client | Minimize; only what the matter strictly needs | `client_asserted` | No duty/privilege to them; don't imply otherwise |

**Hard rules:**
- The UI must never imply we've *confirmed* an adverse partner's accounts. Verified partner figures in family law come from **formal discovery / the partner's sworn Inventory & Appraisement**, not the client's estimate.
- Joint representation requires explicit informed consent and the no-secrets acknowledgment **before** confidential collection; if a conflict emerges, the app flags it and stops.
- Never collect a non-client third party's data as if they were a participant.

---

## 5. Provenance, verification & the "verify before you swear" gate

Three provenance levels, strictly ordered:

1. **`client_asserted`** — a number the client typed. Usable for *strategy and estimates*; visibly flagged everywhere downstream.
2. **`document_extracted`** — pulled from a linked attachment (statement, appraisal, deed). `verification_status = doc_supported`.
3. **`attorney_verified`** — the supervising attorney confirmed it. Required for anything sworn.

**Downstream documents and strategy must visibly flag** every figure that rests on `client_asserted`.

**Sworn-filing gate** (bankruptcy Schedules, family Inventory & Appraisement, anything signed under penalty of perjury): the document generator **refuses to finalize** unless every included item is at least `doc_supported`, and presents the attorney a verification checklist that must be signed off (`attorney_verified`) before the client is asked to swear. The chain is explicit and non-negotiable:

> **AI elicits & organizes → deterministic code computes → attorney verifies → client swears.**

---

## 6. Collection workflow & privilege gating

### 6.1 Structured module, not free-text chat as system-of-record
Chat is excellent for *eliciting*; it is a poor *ledger*. The assistant interviews conversationally, but each asset/debt is written as a **structured `financial_items` row**. A per-matter **Financial Picture** view renders the schedule.

### 6.2 Phase gating (privilege)
- Detailed finances are **collected only in Phase II (privileged)**. If a **free-chat (Phase I)** conversation turns to "here are my accounts/balances," the assistant **stops, explains that Phase I isn't privileged, and routes to Phase II** before collecting. (Prompt rule + a detector on financial disclosure in free chat.)
- Each row records `phase_collected` and `privileged` for auditability.

### 6.3 Matter-specific schedules + gap detection
Completeness is driven by real checklists, surfaced as gaps (reuse the `status = gap` pattern):

- **Bankruptcy:** Schedules A/B (property), C (exemptions), D (secured), E/F (unsecured/priority), I/J (income/expenses); means-test inputs.
- **Family law:** Inventory & Appraisement — community vs separate, each spouse's separate-property claims, debts, retirement/QDRO assets.
- **Estate planning:** asset-by-asset titling + beneficiary designations (the **funding list**), community-property-at-death characterization, step-up considerations.

Cross-inference fills gaps: a mortgage ⇒ a home + escrow; a paystub ⇒ employer + withholding; a business ⇒ valuation question. **Silence ≠ "none"** — the app asks.

### 6.4 Data minimization by phase
Collect **value + characterization first**; defer SSNs and full account numbers until a filing actually needs them (§3.3). Ask "Chase checking, ~$8k"; collect the identifier only at document generation.

---

## 7. Concealment / fraudulent-transfer red-flag detector

A pure, testable module (`lib/financial-red-flags.ts`) mirroring the existing deep-dive libs. Input: the financial items + recent free-text signals. Output: typed flags with severity and a recommended action. It **never assists** concealment; it educates and **escalates to the attorney**.

**Signals (non-exhaustive):**
- Recent **transfer to an insider** (family/friend/own entity) within the look-back window.
- **Asset omitted** from a schedule it belongs on, or value materially **understated vs. a linked document**.
- **Preferential payment** to an insider creditor within ~1 year.
- Unusual **pre-filing luxury purchases, large cash withdrawals, or below-market transfers**.
- Disclosure language indicating intent to **"hide," "move," or "keep off" the books**, or a partner "holding" an asset.
- Adverse-family-law: signs a spouse is **dissipating or hiding** community assets (cuts both ways — protect the client, flag for discovery).

**Behavior on a flag:**
1. **Never** draft to omit or shade. Refuse and explain.
2. **Educate**: full disclosure is a *legal duty* and protects the client (bankruptcy fraud is a crime; fraudulent transfers get unwound; family non-disclosure draws sanctions).
3. **Escalate**: set `needs_attorney_review`, surface in the attorney queue with the triggering facts, and `RECOMMEND_CONSULT`.
4. Record the flag on the item (`red_flags`) for the attorney's audit, not as an accusation.

This is both ethics (Tex. Disciplinary R. 1.02(c)/(d) — a lawyer may not assist crime/fraud) and **client protection**.

---

## 8. Security & privacy

- **Minimize first** — the best-protected datum is the one we didn't collect (§6.4).
- **Redact on ingest** — when a statement is uploaded, extract the needed figure and **segregate/redact** account numbers and SSNs in storage; extend the attachment processor with PII detection.
- **Model boundary** — financial content runs under **zero-data-retention, no-training** (the existing consent posture); raw identifiers in `financial_secure_ref` are **never** placed in a model prompt.
- **Access & audit** — RLS isolates per-client (already hardened on `fact_items`); attorney access to financial records is **logged**; partner/third-party data never leaks across matters.
- **Retention** — follow the firm's retention policy with secure destruction and client export; never silently keep raw identifiers past the filing that needed them.

---

## 9. Deterministic computation boundary

The LLM **elicits and characterizes**; it does **not** do arithmetic. All totals, equity, community/separate splits, exemption math, means-test results, and probate/trust comparisons run in **pure code** over `financial_items`. Calculators consume structured rows, return ranges where inputs are estimates, and label estimates vs. document-backed figures.

---

## 10. Ethics mapping (Texas)

| Concern | Rule / authority | How the spec addresses it |
|---|---|---|
| Competence (accurate, complete facts) | Tex. Disc. R. 1.01 | Structured schedules, gap detection, verification tiers |
| Conflicts / joint representation | R. 1.06, 1.07 | Representation context; no-secrets ack; conflict stop |
| No assisting crime/fraud | R. 1.02(c)–(d) | Red-flag detector; refuse-and-educate; escalate |
| Confidentiality | R. 1.05 | Phase-II gating, RLS, minimization, ZDR |
| AI supervision | Tex. Ethics Op. 705 | AI gathers; attorney verifies; nothing final pre-review |
| Sworn-filing integrity | Bankruptcy Code §521/§727; TFC inventory duties | Verify-before-you-swear gate |

---

## 11. Build phasing

1. **M1 — Representation context + structured `financial_items`** (table, RLS, the three-axis tagging, Financial Picture view). Unlocks correct partner handling immediately.
2. **M2 — Phase gating + free-chat disclosure detector** (keep finances in Phase II) and **document grounding** (link figures to attachments; extract values).
3. **M3 — Matter schedules + gap detection** (bankruptcy/family/estate checklists; cross-inference).
4. **M4 — Red-flag detector + attorney verification queue + sworn-filing gate.**
5. **M5 — Secure identifier vault + ingest redaction + audit logging.**

Each milestone is independently shippable and testable in the deep-dive pattern (pure libs + tests + UI).

---

## 12. Open decisions (need product/attorney input)

1. **Joint estate clients:** do we offer true joint representation in-app, or always single-client with the spouse as a separate engagement? (Drives whether `joint_spouses` ships at all.)
2. **Look-back windows** for the red-flag detector (track bankruptcy 90-day / 1-year insider and 2-year fraudulent-transfer windows; confirm exact thresholds with the attorney).
3. **How far to automate discovery** of an adverse spouse's assets vs. leaving it to formal discovery.
4. **Identifier vault**: build in-app encrypted store now, or defer raw identifiers to the attorney's separate filing system entirely?
5. **Whether the app ever shows a partner their own data** in a joint-client matter, or keeps a single client-facing surface.
