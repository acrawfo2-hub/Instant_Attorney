# Instant Attorney — Legal & Compliance Document Drafts

**Status: DRAFTS FOR ATTORNEY REVIEW. NOT YET EFFECTIVE. DO NOT PUBLISH OR RELY ON UNTIL REVIEWED, EDITED, AND APPROVED BY LICENSED COUNSEL.**

Prepared as working drafts to be reviewed by Andrew Crawford, Esq. and other
attorneys. They are written to be comprehensive starting points, not final
language. Nothing here is legal advice, and the AI that drafted them is not a
lawyer.

Firm: **Crawford Law PLLC** · Texas Bar #24148908 · Responsible attorney:
Andrew Crawford, Esq. · Licensed in **Texas and Illinois**.

## Documents in this set

| # | File | Purpose |
|---|------|---------|
| 1 | `01-client-representation-agreement.md` | The signed engagement letter that forms the limited-scope attorney-client relationship (Phase II). |
| 2 | `02-ai-consent-and-acp-notice.md` | Informed consent to AI-assisted services + third-party processing, and the attorney-client privilege (ACP) notice and limits. |
| 3 | `03-terms-of-service.md` | Platform contract: accounts, subscription, automatic usage top-ups, spend limits, cancellation, acceptable use, warranties, liability, disputes. |
| 4 | `04-privacy-policy.md` | What data is collected, how it is processed and shared, retention/deletion, security, and individual rights. |
| 5 | `05-billing-and-refund-disclosure.md` | Stand-alone, clear-and-conspicuous pre-purchase auto-renewal + usage-charge + no-refund disclosure (auto-renewal-law / negative-option compliance). |
| 6 | `06-legal-disclaimers.md` | Site-wide disclaimers, advertising/bar disclosures, no-advice/no-privilege notices, jurisdiction limits. |
| 7 | `07-document-retention-and-destruction-policy.md` | Ethics-aligned client file retention schedule, access/export rights, and destruction process (replaces the 30-day deletion). |
| 8 | `08-ai-philosophy-statement.md` | Public-facing AI philosophy statement: why we use AI, attorney-in-the-loop, limitations, confidentiality, access to justice, and ethical commitments (Op. 705 aligned). Rendered at `/legal/ai-philosophy`. |

## What the app actually does (the facts these drafts must match)

- **Phase I** — free, no account: general legal information only. No attorney-client relationship, no privilege.
- **Phase II** — **$9.99/month** subscription: AI-assisted intake within a signed representation agreement, AI document drafting, and attorney review (target 48 hours).
- **Automatic usage top-ups** — token usage is metered in dollars (internal cost). When cumulative AI usage cost since the last top-up reaches **$4.75**, an **$8.50** one-time charge is automatically charged to the card on file (off-session). Repeats whenever the threshold is reached again.
- **User spending limit** — each customer has a pre-approved monthly cap on automatic top-ups (default **$25/month**, user-adjustable). When a top-up would exceed the cap, charging pauses until the user raises the cap.
- **Service pause on failed/declined charge** — AI features pause until payment succeeds.
- **Free/exempt accounts** — specific internal/test accounts are exempt from all billing.
- **Phase III** — **$49.99** one-time consult.
- **Cancellation policy (intended)** — cancellation stops future renewals; access continues through the paid period; **no refunds or proration**; outstanding metered usage is **trued up** (charged) at cancellation.
- **Data retention (decided)** — the 30-day deletion is **replaced** by an ethics-aligned retention schedule (Document 7): client matter files retained at least 5 years after the engagement ends, longer/indefinite for certain records, with client export/copy rights and notice before destruction. **The app's current 30-day auto-deletion must be re-implemented to match.**
- **AI provider (decided)** — a **single** provider (Anthropic) is used deliberately to simplify enabling **zero-data-retention (ZDR)**, which is a **pre-launch prerequisite** before any ZDR claim is published.
- **Dispute resolution (decided)** — **binding arbitration is included** (Document 1 §14, Document 3 §14) with Texas Ethics Op. 586 informed-consent safeguards.
- **Vendors** — Anthropic (AI inference), Supabase (cloud hosting/storage), Stripe (payments), Resend (transactional email).

## ⚠️ Open issues that require an attorney decision (do not skip)

1. **Retention — confirm the schedule.** Document 7 sets a 5-year default and category exceptions; confirm the periods, the pre-destruction notice/export mechanism, and which records must be kept longer. The **cold-archival engine is now built** (archives instead of deletes; see Document 7 implementation status) — remaining: confirm periods, enable it (`ARCHIVE_ENCRYPTION_KEY` + scheduled `…/archives/run`), decide the quick-consult 7-day question, and add the client-notice step before any end-of-retention destruction.
2. **Limiting liability to a client.** Tex. Disciplinary R. 1.08(g) restricts prospectively limiting a lawyer's malpractice liability to a client. The Terms' limitation-of-liability and warranty disclaimers are drafted to **expressly carve out** legal-malpractice and non-waivable claims, but counsel must confirm the carve-outs are sufficient and that platform (non-legal-services) liability is treated separately.
3. **Arbitration — finalize the open sub-decisions.** Arbitration is now included with informed-consent language (Op. 586), a malpractice-liability non-limitation, preserved State Bar grievance rights, and small-claims/injunctive carve-outs. **Decide:** administrator (AAA vs. JAMS), seat/county, the **class-action waiver**, and whether to keep the **30-day opt-out**. Confirm the consent presentation is conspicuous and consider advising independent counsel.
4. **ZDR — confirm before launch.** Do not publish ZDR claims until ZDR is actually enabled with Anthropic.
5. **Advertising / no-overpromising (Rule 7.0x).** Marketing language about privilege and outcomes must not be false or misleading. Landing-page privilege claims were softened and two inaccurate claims (PII scrubbing; unqualified zero-retention) were corrected.
6. **Fee reasonableness (Rule 1.04).** Confirm that the subscription + automatic usage top-ups are reasonable, adequately explained, and properly characterized (legal fee vs. cost reimbursement) in the engagement agreement.
7. **Limited-scope representation (Rule 1.02(b)).** The engagement is drafted as limited scope; confirm the scope boundaries and that they are reasonable and consented to.
8. **Multi-state / UPL.** Firm is licensed in TX and IL only. Confirm intake gating and disclosures for users in other jurisdictions.
9. **Versioning & records.** When approved, set the effective date and version, and ensure the signed-agreement records (`representation_agreements`, `ai_consents`) capture the exact version and timestamp accepted.

## How these map into the app

- Documents **1 and 2** are the click-to-sign agreements presented during onboarding (`app/onboarding/page.tsx`) and recorded by `POST /api/agreements`. Update the version string there when text is finalized.
- Documents **3–6** are rendered at `/legal/terms`, `/legal/privacy`, `/legal/billing`, and `/legal/disclaimers`, linked from the landing footer, legal page footers, and onboarding checkout. Treat as drafts until attorney approval.
- Document **8** is rendered at `/legal/ai-philosophy` and linked from the landing footer, onboarding AI consent step, and free chat. Treat as draft until attorney approval.
