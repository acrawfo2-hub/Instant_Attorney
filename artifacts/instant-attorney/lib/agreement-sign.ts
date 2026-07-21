/**
 * Platform agreement e-sign helpers.
 *
 * Representation agreements and AI consents use typed-name UETA/ESIGN clickwrap.
 * These helpers harden the evidentiary record: content hash of the exact text
 * presented, request metadata, and a downloadable .docx receipt.
 */

import { createHash } from "crypto";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";

export const REPRESENTATION_AGREEMENT_VERSION = "2.0-draft";
export const AI_CONSENT_VERSION = "2.0-draft";

/** Canonical text shown at sign time — must match onboarding UI. */
export const REPRESENTATION_AGREEMENT_TEXT = `CRAWFORD LAW PLLC — CLIENT REPRESENTATION AGREEMENT (LIMITED SCOPE)
Draft v2.0 — pending attorney review.

This Agreement is between Crawford Law PLLC ("Firm"), a Texas professional limited liability company, Texas Bar #24148908 (responsible attorney: Andrew Crawford, Esq.; licensed in Texas and Illinois), and the person who signs below ("Client"). Typing your name and clicking to sign creates a binding agreement and an electronic signature.

1. SCOPE OF REPRESENTATION (LIMITED)
The Firm represents Client in limited scope through the Instant Attorney platform: (a) AI-assisted intake to gather facts; (b) analysis of legal issues, risks, and pathways; and (c) preparation and attorney review of eligible legal documents. This engagement does NOT include, unless separately agreed in writing and separately priced: court appearances; filing with any court or agency; litigation, hearings, mediation, or arbitration; negotiation with opposing parties; deadline/limitations calendaring; ongoing monitoring; or matters outside Texas and Illinois. Client remains responsible for all deadlines unless the Firm agrees in writing to assume them.

2. WHEN REPRESENTATION BEGINS
Phase I (free) is general information only — NO attorney-client relationship and NO privilege. The attorney-client relationship forms when Client signs this Agreement, the subscription is active, and the Firm completes its conflicts check and accepts the engagement.

3. AI-ASSISTED SERVICES AND ATTORNEY SUPERVISION
The Firm uses AI tools (including models from Anthropic, PBC) under attorney supervision. AI is a tool, not your attorney. A licensed attorney reviews AI-generated documents before delivery as approved. Pre-review drafts are labeled and must not be filed, signed, or relied upon until approved. (See the AI & Privilege consent, incorporated by reference.)

4. FEES AND AUTOMATIC USAGE CHARGES
These are legal fees intended to be reasonable under Tex. Disciplinary R. 1.04. (a) Subscription: $9.99/month, billed in advance, auto-renewing monthly until cancelled. (b) Automatic usage top-ups: when Client's cumulative metered AI usage since the last top-up reaches $4.75, Client authorizes an automatic one-time $8.50 charge to the payment method on file; this may recur whenever the threshold is reached. (c) Spending cap: Client sets a pre-approved monthly cap on automatic top-ups (default $25/month); automatic charging and AI features pause once a top-up would exceed the cap, until Client raises it or the month renews. (d) Declined payments pause AI features until payment succeeds. (e) Cancellation true-up: at cancellation Client authorizes a final charge for metered usage already incurred but not yet charged. Client authorizes the Firm and Stripe to store the payment method and make these charges automatically.

5. CANCELLATION; NO REFUNDS
Client may cancel anytime. Cancellation stops auto-renewal; access continues through the paid period; fees already paid are non-refundable and not prorated (except where required by law); the Section 4(e) true-up applies.

6. FILE RETENTION AND ACCESS
Your interactive app access ends when your subscription ends; this is separate from how long the Firm retains your client file. The Firm retains client matter files for at least five (5) years after the engagement ends, and longer or indefinitely for certain records (e.g., original wills and items of intrinsic value, conflicts records, signed agreements, minors' matters), under its Client File Retention & Destruction Policy. You own your documents: export them during the engagement (you'll be reminded before access ends) and you may request a copy during the retention period. After the retention period, files are securely destroyed only after reasonable notice and a chance to obtain them. This replaces any prior 30-day deletion practice.

7. CONFIDENTIALITY AND PRIVILEGE
The Firm protects Client information under Tex. Disciplinary R. 1.05. Phase II communications to obtain legal services are intended to be privileged, subject to limits including the crime-fraud exception and waiver by third-party disclosure. Privilege is decided by courts and cannot be guaranteed in every proceeding.

8. CLIENT OBLIGATIONS
Provide truthful, complete information; respond promptly; do not rely on pre-approval drafts; use the platform only for lawful purposes and never to commit or further a crime or fraud or plan future unlawful conduct.

9. NO GUARANTEE; CONFLICTS; TERMINATION; GOVERNING LAW
The Firm provides competent, diligent service but guarantees no outcome. The Firm checks conflicts (R. 1.06–1.09) and may decline or withdraw consistent with R. 1.15. Either party may terminate with notice; earned fees and authorized charges survive. This Agreement is governed by Texas law and the Texas Disciplinary Rules of Professional Conduct.

10. BINDING ARBITRATION (PLEASE READ CAREFULLY)
Except as below, you and the Firm agree that any dispute arising out of or relating to this engagement, the Firm's services, fees, or the platform — INCLUDING legal-malpractice and fee disputes — will be resolved by FINAL AND BINDING ARBITRATION on an individual basis, seated in [county], Texas, under the Federal Arbitration Act. This means you GIVE UP your right to a judge or jury trial and most appeal rights, and discovery may be limited. This changes only the FORUM; it does NOT cap, reduce, or waive the Firm's substantive liability (including for malpractice) or any duty under the Texas Disciplinary Rules. Because this affects important rights, you may — and are encouraged to — consult an independent attorney before agreeing. Arbitration does NOT apply to and does NOT waive: your right to file a grievance with the State Bar of Texas; claims that by law cannot be arbitrated; small-claims matters; or requests for emergency/injunctive relief. [Class actions waived; you may opt out in writing within 30 days — pending attorney review.] NOTHING in this Agreement limits or waives any right that cannot be limited or waived by law or the Texas Disciplinary Rules, including any restriction on prospectively limiting the Firm's malpractice liability (R. 1.08(g)).

Crawford Law PLLC · www.instant-attorney.com · Texas Bar #24148908`;

export const AI_CONSENT_TEXT = `CONSENT TO AI-ASSISTED SERVICES & ATTORNEY-CLIENT PRIVILEGE NOTICE
Draft v2.0 — pending attorney review.

By signing, I ("Client") give informed consent to the following and acknowledge the privilege notice below.

PART A — AI-ASSISTED SERVICES
1. AI USE. Crawford Law PLLC uses AI tools, including models from Anthropic, PBC, to assist with intake, analysis, and document drafting. AI is a tool, not my attorney, and does not exercise legal judgment.
2. ATTORNEY REVIEW. A licensed attorney supervises AI use and reviews AI-generated documents before delivery as approved. Pre-review drafts must not be filed, signed, or relied upon. These practices are intended to comply with the Texas Disciplinary Rules and Texas Ethics Opinion 705.
3. AI LIMITATIONS. AI can produce incomplete, outdated, or incorrect output (including "hallucinations"). Attorney review is the safeguard, but no process is perfect; I will raise concerns before acting on a document.
4. CONFIDENTIALITY & DATA. The Firm treats my Phase II information as confidential under Tex. Disciplinary R. 1.05, uses a single AI provider (Anthropic, PBC), does NOT permit my content to be used to train AI models, and is enabling zero-data-retention processing before public launch so prompt/output content is not retained by the AI provider. (See Privacy Policy.)
5. THIRD-PARTY PROVIDERS. I consent to processing by the Firm's service providers acting as its agents under confidentiality and data-protection obligations: AI inference (Anthropic), cloud hosting/storage (Supabase), payments (Stripe), and transactional email (Resend).
6. BILLING. I acknowledge AI usage has a cost, charged via the subscription and automatic usage top-ups described in my Representation Agreement.
7. REVOCATION. I may revoke this consent in writing at any time. Because AI assistance is integral to the service, revocation generally ends the Firm's ability to provide platform services and may end the engagement. Revocation does not affect prior lawful processing or charges already incurred.

PART B — ATTORNEY-CLIENT PRIVILEGE (READ CAREFULLY)
8. Phase I (free) communications are NOT privileged — do not share sensitive facts there. Phase II communications made to obtain legal services, after I sign and while subscribed, are intended to be privileged.
9. LIMITS. Privilege may not apply or may be lost: (a) crime-fraud — communications to commit/further a crime or fraud, or to plan future unlawful conduct, are not privileged; (b) third-party disclosure may waive privilege; (c) my own public use may waive it; (d) privilege is applied by courts and cannot be guaranteed in any particular proceeding.
10. VENDORS. The Firm's use of agents (AI, cloud) under confidentiality obligations is not intended to waive privilege, subject to the limits above.

These practices rely in good faith on Tex. Disciplinary R. 1.05 and Texas Ethics Opinion 705.`;

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function agreementContentHash(text: string): string {
  // Normalize newlines so UI/source formatting differences don't break the hash.
  return sha256Hex(text.replace(/\r\n/g, "\n").trim());
}

export interface SignAuditFields {
  signature_name: string;
  agreement_version: string;
  content_sha256: string;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signed_at?: string;
}

export function extractRequestAudit(req: {
  headers: { get(name: string): string | null };
}): Pick<SignAuditFields, "signer_ip" | "signer_user_agent"> {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const signer_ip =
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    realIp ||
    null;
  const signer_user_agent = req.headers.get("user-agent");
  return { signer_ip, signer_user_agent };
}

/** Build a downloadable .docx receipt for a signed representation agreement. */
export async function buildAgreementReceiptDocx(opts: {
  signatureName: string;
  agreementVersion: string;
  contentSha256: string;
  signedAt: string;
  signerIp: string | null;
  signerUserAgent: string | null;
  agreementText: string;
}): Promise<Buffer> {
  const meta = (label: string, value: string) =>
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: 20 }),
        new TextRun({ text: value, size: 20 }),
      ],
    });

  const bodyParas = opts.agreementText.split(/\n+/).map(
    (line) =>
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: line || " ", size: 18 })],
      })
  );

  const doc = new DocxDocument({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "Signed Representation Agreement — Receipt",
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "Crawford Law PLLC · Instant Attorney · Electronic signature record (UETA / ESIGN)",
                italics: true,
                size: 18,
              }),
            ],
          }),
          meta("Signed name (electronic signature)", opts.signatureName),
          meta("Agreement version", opts.agreementVersion),
          meta("Signed at (UTC)", opts.signedAt),
          meta("Content SHA-256", opts.contentSha256),
          meta("Signer IP", opts.signerIp ?? "(not recorded)"),
          meta("User agent", opts.signerUserAgent ?? "(not recorded)"),
          new Paragraph({
            spacing: { before: 200, after: 200 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 8 },
            },
            children: [
              new TextRun({
                text: "By typing the name above and clicking to agree, the client adopted that typed name as an electronic signature with the same effect as a handwritten signature.",
                size: 18,
              }),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 160 },
            children: [new TextRun({ text: "Agreement text as presented", bold: true, size: 24 })],
          }),
          ...bodyParas,
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
