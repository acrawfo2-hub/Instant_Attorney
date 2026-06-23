# Client File Retention & Destruction Policy

**DRAFT v1.0 — FOR ATTORNEY REVIEW. NOT EFFECTIVE UNTIL APPROVED.**
**Effective date: [TO BE SET]**

This policy governs how **Crawford Law PLLC** retains, makes available, and
ultimately destroys client files and related records created through the Instant
Attorney platform. It is written to align with the Firm's ethical duties regarding
client property and file retention, and it **replaces the prior 30-day post-
cancellation deletion practice**, which did not reflect those duties.

> **⚠️ ATTORNEY REVIEW.** Confirm all periods and category rules below against the
> Texas Disciplinary Rules of Professional Conduct (esp. **R. 1.14** Safekeeping
> Property and **R. 1.15(d)** surrender of client papers on termination) and Texas
> ethics guidance on file retention/destruction (e.g., **Tex. Ethics Op. 627**;
> trust-records guidance in **Op. 657 / R. 1.14(a)**). The five-year default and the
> category exceptions are recommended starting points, not adjudicated minimums.

---

## 1. Key principle: app access ≠ file destruction

Two different things happen, and they must not be confused:

- **Your access to the interactive app** ends when your subscription ends (after
  the paid period / archival). After that you can no longer log in and work in your
  Living File.
- **The Firm's retention of your client file** continues for the period in this
  policy, separate from app access, because the Firm has ethical duties regarding
  client property and records.

**You own your documents.** Before your access ends — and on request during the
retention period — you may obtain a copy of your file (Section 5).

## 2. The client file vs. Firm work product

- **Client file / client property:** the documents, information, and materials you
  provided, and the finished work product delivered to you (e.g., attorney-approved
  documents). You are entitled to these.
- **Firm internal materials:** the Firm's internal notes, drafts, and administrative
  records. Some of these are retained for the Firm's own purposes and obligations.

## 3. Retention schedule (recommended defaults)

| Category | Retention |
|---|---|
| **General client matter files** (intake, analysis, delivered documents) | **At least 5 years** after the engagement ends (matter closed or subscription cancelled), then eligible for destruction under Section 4. |
| **Trust/financial, payment, and billing records** | **At least 5 years** after the engagement ends (consistent with R. 1.14(a) trust-record duties). |
| **Signed engagement records** (Representation Agreement, AI Consent, arbitration acknowledgment, version + timestamp) | Retained for the **longer of** the matter-file period or as required to evidence consent; recommended **indefinite**. |
| **Conflicts-of-interest records** (names/parties sufficient to run future conflicts checks) | **Indefinite.** |
| **Original documents and items of intrinsic value** (e.g., executed wills, signed originals, items that cannot be replaced) | **Returned to you** or retained **indefinitely**; **never destroyed** without first offering return. |
| **Estate-planning instruments** (wills, trusts) | Originals returned to you or retained **indefinitely**; recommend returning originals to the client. |
| **Matters involving a minor** | Until the minor reaches the age of majority **plus** the applicable limitations period. |
| **Real-property instruments** | Extended/indefinite retention given long-tail relevance. |

The Firm will retain a file **longer** than the periods above whenever it has reason
to believe the file may still be needed — for example, an ongoing or anticipated
matter, an unresolved fee dispute, a threatened or pending claim, a litigation hold,
or a legal-preservation obligation.

## 4. Destruction process

After the applicable retention period, and only then, the Firm may destroy a file,
**subject to all of the following**:

1. **No items requiring return or longer retention** remain in the file
   (originals/intrinsic-value items and the indefinite-retention categories in
   Section 3 are excluded from destruction).
2. **Reasonable advance notice** is provided to your last known email/contact, with
   an opportunity to obtain the file before destruction.
3. **No hold applies** (no pending/anticipated claim, dispute, or legal hold).
4. Destruction is performed **securely** (secure deletion of electronic records).

## 5. Your access and export rights

- **During the engagement:** export or download your documents at any time.
- **At cancellation:** you are reminded to export anything you want to keep before
  app access ends.
- **During the retention period after access ends:** you may request a copy of your
  client file in writing at [contact]; the Firm will provide it consistent with its
  professional obligations and reasonable verification of your identity.

## 6. Security during retention

Retained files contain confidential and potentially privileged information and are
protected under the Firm's confidentiality duties (R. 1.05) and the Privacy Policy
(Document 4), including access controls, encryption in transit, and restricted
database access. Retaining files for the periods above necessarily increases the
amount of data held; the Firm mitigates this through its security program and
through zero-data-retention processing on the AI side (Document 2, §A.4).

## 7. Relationship to other documents

This policy is incorporated into the Representation Agreement (Document 1, §7), the
Terms of Service (Document 3, §6), and the Privacy Policy (Document 4, §6). If those
documents state a specific period inconsistent with this policy after approval, this
policy controls for retention.

> **Implementation note (engineering) — MUST reconcile before launch.** The app
> today has **two** deletion mechanisms that contradict this policy:
> 1. **Case-file archive → permanent deletion in 30 days** (`CaseFileCard.tsx`
>    "scheduled for deletion in 30 days"; `case_files.archive_at`; the
>    `/api/case-files/[id]/archive` flow and whatever job acts on `archive_at`).
> 2. **Quick-consult conversations → "archived and permanently deleted in 7 days
>    unless you save it"** (`QuickConsultModal.tsx`, `app/chat/page.tsx`). Note these
>    are described as ACP-protected; deleting privileged client communications on a
>    7-day timer should be reviewed even where the client declined to save.
>
> Required changes: (a) stop automatic permanent deletion of client **matter files**
> on these short timers; (b) provide export + pre-deletion notice; (c) implement
> category-aware retention, legal holds, and the schedule in Section 3; (d) preserve
> signed-agreement and conflicts records.
>
> **Until that backend work lands, do NOT change the operative in-app deletion copy
> (the "30 days" / "7 days" strings) to claim long-term retention — the live behavior
> still deletes on those timers, so the current strings remain accurate for now.**
> These legal drafts are not yet effective; the code and copy must change together
> when the policy is adopted.
