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

## What the app actually does (the facts these drafts must match)

- **Phase I** — free, no account: general legal information only. No attorney-client relationship, no privilege.
- **Phase II** — **$9.99/month** subscription: AI-assisted intake within a signed representation agreement, AI document drafting, and attorney review (target 48 hours).
- **Automatic usage top-ups** — token usage is metered in dollars (internal cost). When cumulative AI usage cost since the last top-up reaches **$4.75**, an **$8.50** one-time charge is automatically charged to the card on file (off-session). Repeats whenever the threshold is reached again.
- **User spending limit** — each customer has a pre-approved monthly cap on automatic top-ups (default **$25/month**, user-adjustable). When a top-up would exceed the cap, charging pauses until the user raises the cap.
- **Service pause on failed/declined charge** — AI features pause until payment succeeds.
- **Free/exempt accounts** — specific internal/test accounts are exempt from all billing.
- **Phase III** — **$49.99** one-time consult.
- **Cancellation policy (intended)** — cancellation stops future renewals; access continues through the paid period; **no refunds or proration**; outstanding metered usage is **trued up** (charged) at cancellation.
- **Data retention (current)** — on cancellation/inactivity the file is archived and then **permanently deleted after 30 days**.
- **Vendors** — Anthropic (AI inference), Supabase (cloud hosting/storage), Stripe (payments), Resend (transactional email).

## ⚠️ Open issues that require an attorney decision (do not skip)

1. **30-day deletion vs. file-retention duties.** Permanently deleting a former client's file 30 days after cancellation may conflict with a lawyer's duties regarding client property and file retention (Tex. Disciplinary R. 1.14/1.15 and related authority; many practitioners retain client files for years). At minimum, clients likely need conspicuous advance notice and an opportunity to download/export before deletion. **Confirm the retention period and the pre-deletion notice/export mechanism with counsel before enabling deletion.**
2. **Limiting liability to a client.** Tex. Disciplinary R. 1.08(g) restricts prospectively limiting a lawyer's malpractice liability to a client. The Terms' limitation-of-liability and warranty disclaimers are drafted to **expressly carve out** legal-malpractice and non-waivable claims, but counsel must confirm the carve-outs are sufficient and that platform (non-legal-services) liability is treated separately.
3. **Mandatory arbitration / class waiver with clients.** Including binding arbitration in a client engagement implicates ethics duties (informed consent, possibly advising the client to seek independent counsel). The arbitration clause is included **bracketed and optional** — decide whether to keep it, and how to obtain informed consent.
4. **Advertising / no-overpromising (Rule 7.0x).** Marketing language about privilege and outcomes must not be false or misleading. Suggested softening of landing-page privilege claims is noted in the disclaimers draft and was partially applied to the site.
5. **Fee reasonableness (Rule 1.04).** Confirm that the subscription + automatic usage top-ups are reasonable, adequately explained, and properly characterized (legal fee vs. cost reimbursement) in the engagement agreement.
6. **Limited-scope representation (Rule 1.02(b)).** The engagement is drafted as limited scope; confirm the scope boundaries and that they are reasonable and consented to.
7. **Multi-state / UPL.** Firm is licensed in TX and IL only. Confirm intake gating and disclosures for users in other jurisdictions.
8. **Versioning & records.** When approved, set the effective date and version, and ensure the signed-agreement records (`representation_agreements`, `ai_consents`) capture the exact version and timestamp accepted.

## How these map into the app

- Documents **1 and 2** are the click-to-sign agreements presented during onboarding (`app/onboarding/page.tsx`) and recorded by `POST /api/agreements`. Update the version string there when text is finalized.
- Documents **3–6** are intended to be linked (footer + checkout) and acknowledged at sign-up; they are not yet rendered as in-app pages — wiring them in is a follow-up once text is approved.
