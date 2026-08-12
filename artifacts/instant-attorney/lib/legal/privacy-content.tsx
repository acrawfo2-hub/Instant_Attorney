import Link from "next/link";
import { LegalCallout } from "@/lib/legal/callouts";
import type { LegalDocumentMeta, LegalSection } from "@/lib/legal/types";

export const PRIVACY_META: LegalDocumentMeta = {
  title: "Privacy Policy",
  subtitle:
    "How Crawford Law PLLC collects, uses, shares, retains, and protects your information.",
  version: "Draft v1.0 — pending attorney review",
  effectiveDate: "[TO BE SET]",
  footerNote:
    "For Phase II clients, information you share is also confidential client information protected by attorney-client privilege and Tex. Disciplinary R. 1.05. Where this Policy and those duties differ, the stricter protection applies.",
};

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "controller",
    title: "Who we are",
    content: (
      <p>
        Crawford Law PLLC, Texas Bar #24148908, is responsible for the information described here.
        Andrew Crawford, Esq. is the responsible attorney.
      </p>
    ),
  },
  {
    id: "collection",
    title: "Information we collect",
    content: (
      <>
        <p><strong>You provide:</strong></p>
        <ul>
          <li>
            <strong>Account &amp; identity:</strong> name, email, electronic-signature name, and
            login credentials
          </li>
          <li>
            <strong>Intake &amp; case content:</strong> facts, messages, goals, documents, uploaded
            files, and text extracted from them
          </li>
          <li><strong>Communications:</strong> messages with the Firm and support requests</li>
        </ul>
        <p><strong>Collected automatically:</strong></p>
        <ul>
          <li>
            <strong>Usage data:</strong> features used, AI usage metering, top-up and spending-limit
            activity, timestamps
          </li>
          <li>
            <strong>Device/log data:</strong> IP address, browser/device type, and essential
            cookies needed to run the Platform
          </li>
        </ul>
        <p><strong>From service providers:</strong></p>
        <ul>
          <li>
            <strong>Payment data:</strong> processed by <strong>Stripe</strong>. We do not store
            full card numbers.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use information",
    content: (
      <ul>
        <li>
          To provide Phase I information and Phase II/III legal services, including AI-assisted
          intake, analysis, and attorney-reviewed documents
        </li>
        <li>To create and manage your account and case file</li>
        <li>
          To meter usage and process subscription fees, automatic top-ups, spending-limit
          enforcement, and the cancellation true-up
        </li>
        <li>To communicate with you (document-ready notifications, billing notices)</li>
        <li>
          To maintain security, prevent abuse, and comply with legal and ethical obligations
        </li>
      </ul>
    ),
  },
  {
    id: "ai",
    title: "AI processing",
    content: (
      <>
        <p>
          We use <strong>AI providers</strong> to process your content:{" "}
          <strong>Anthropic, PBC (Claude)</strong> by default, and <strong>xAI (Grok)</strong> when
          you select that preference (some features may still use Anthropic). We prohibit use of
          your content to train AI models.{" "}
          <strong>
            Zero-data-retention (ZDR) processing will be enabled with each AI provider before that
            provider is used for public client content
          </strong>{" "}
          so that prompt and output content is not retained by that provider. AI output is reviewed
          by an attorney before being delivered as approved.
        </p>
        <p>
          See the <Link href="/legal/ai-philosophy">AI Philosophy Statement</Link> and your AI
          Consent signed at onboarding.
        </p>
        <LegalCallout>
          <strong>Attorney review.</strong> Confirm ZDR is in place for each enabled provider
          before launch. Do not publish ZDR claims until enabled.
        </LegalCallout>
      </>
    ),
  },
  {
    id: "sharing",
    title: "How we share information",
    content: (
      <>
        <p>We share information only as needed to provide the service or as required by law:</p>
        <ul>
          <li>
            <strong>Service providers (our agents):</strong> AI inference (Anthropic; xAI when
            selected or required), cloud hosting and storage (Supabase), payment processing
            (Stripe), and transactional email (Resend), each under contractual confidentiality
            obligations
          </li>
          <li>
            <strong>Legal and ethical compliance:</strong> where required by law, court order, or the
            Texas Disciplinary Rules, including the crime-fraud limitation on privilege
          </li>
          <li><strong>With your direction or consent</strong></li>
          <li>
            <strong>Business changes:</strong> in connection with a merger or transfer of the
            practice, consistent with professional obligations
          </li>
        </ul>
        <p>
          <strong>We do not sell your personal information, and we do not share it for behavioral
          advertising.</strong>
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Data retention and deletion",
    content: (
      <>
        <p>We retain information under our Client File Retention &amp; Destruction Policy. In summary:</p>
        <ul>
          <li>
            Your <strong>interactive app access</strong> ends when your subscription ends; that is
            separate from how long the Firm <strong>retains your file</strong>
          </li>
          <li>
            Client matter files are retained for <strong>at least five (5) years</strong> after the
            engagement ends, with certain records kept longer or indefinitely
          </li>
          <li>
            You can <strong>export your documents</strong> during the engagement and may{" "}
            <strong>request a copy</strong> during the retention period
          </li>
          <li>
            After the retention period, files are securely destroyed only after reasonable advance
            notice and an opportunity to obtain them
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <p>
        We use reasonable administrative, technical, and organizational safeguards appropriate to
        the sensitivity of legal information, including access controls, encryption in transit, and
        row-level access restrictions. <strong>No system is perfectly secure.</strong> Notify us
        immediately if you believe your account has been compromised. We will notify you of data
        breaches as required by applicable law.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your choices and rights",
    content: (
      <>
        <p>
          Depending on your location and applicable law, you may have rights to access, correct, or
          delete your information, or withdraw consent. Some rights are limited by the Firm&apos;s
          legal and ethical recordkeeping duties. Withdrawing AI consent generally ends the ability
          to provide Platform services.
        </p>
        <LegalCallout variant="info">
          <strong>Attorney review.</strong> Confirm which state privacy laws apply (e.g., Texas
          Data Privacy and Security Act) and tailor rights and response timelines accordingly.
        </LegalCallout>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    content: (
      <p>
        The Platform is not directed to, and may not be used by, anyone under 18. We do not
        knowingly collect information from children.
      </p>
    ),
  },
  {
    id: "jurisdiction",
    title: "Jurisdiction",
    content: (
      <p>
        The Platform is operated from the United States and intended for U.S. users. If you access
        it from elsewhere, you do so on your own initiative and are responsible for local-law
        compliance.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this Policy",
    content: (
      <p>
        We may update this Policy prospectively. Material changes will be communicated through the
        Platform or by email.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>Crawford Law PLLC · Texas Bar #24148908 · www.instant-attorney.com</p>
    ),
  },
];
