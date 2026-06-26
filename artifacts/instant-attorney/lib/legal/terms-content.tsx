import Link from "next/link";
import { LegalCallout } from "@/lib/legal/callouts";
import type { LegalDocumentMeta, LegalSection } from "@/lib/legal/types";

export const TERMS_META: LegalDocumentMeta = {
  title: "Terms of Service",
  subtitle:
    "The platform agreement governing your use of Instant Attorney, operated by Crawford Law PLLC.",
  version: "Draft v1.0 — pending attorney review",
  effectiveDate: "[TO BE SET]",
  footerNote:
    "These Terms supplement your Client Representation Agreement and AI Consent for Phase II clients. If those documents conflict regarding the legal engagement, the Representation Agreement controls.",
};

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: "eligibility",
    title: "Eligibility",
    content: (
      <p>
        You must be at least 18 years old and able to form a binding contract. The Platform is
        intended for users in the United States. The Firm is licensed only in Texas and Illinois;
        see the jurisdiction section and your Representation Agreement for limits.
      </p>
    ),
  },
  {
    id: "what-platform-is",
    title: "What the Platform is — and is not",
    content: (
      <>
        <ul>
          <li>
            <strong>Phase I</strong> provides <strong>general legal information only.</strong> It
            is not legal advice, does not create an attorney-client relationship, and is not
            privileged.
          </li>
          <li>
            <strong>Phase II</strong> provides AI-assisted legal services within a signed
            representation agreement, including attorney-reviewed documents.
          </li>
          <li>
            <strong>Phase III</strong> is a one-time paid consultation.
          </li>
        </ul>
        <p>
          The Platform is <strong>not</strong> a substitute for advice from a licensed attorney
          about your specific situation in Phase I, and is <strong>not</strong> an emergency
          service. If you have an urgent legal deadline or emergency, seek appropriate help
          immediately.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and security",
    content: (
      <p>
        You must provide accurate registration information and keep it current. You are responsible
        for all activity under your account and for keeping your credentials confidential. Notify
        us promptly of any unauthorized use. We may suspend or terminate accounts that violate
        these Terms.
      </p>
    ),
  },
  {
    id: "jurisdiction",
    title: "No unauthorized practice / jurisdiction",
    content: (
      <p>
        The Firm practices law only where its attorneys are licensed (Texas and Illinois).
        Information provided for other jurisdictions is general in nature, and you may need local
        counsel. Nothing on the Platform is an offer to practice law where the Firm is not
        authorized.
      </p>
    ),
  },
  {
    id: "billing",
    title: "Subscriptions, automatic usage top-ups, and spending limits",
    content: (
      <>
        <p>
          By starting a Phase II subscription, <strong>you authorize recurring and usage-based
          charges as follows.</strong> Full detail is in the{" "}
          <Link href="/legal/billing">Billing &amp; Refund Disclosure</Link>, which is incorporated
          here.
        </p>
        <ol>
          <li>
            <strong>Subscription.</strong> A recurring fee of <strong>$9.99/month</strong>, charged
            in advance, which <strong>automatically renews</strong> each month until cancelled.
          </li>
          <li>
            <strong>Automatic usage top-ups.</strong> When your cumulative metered usage since your
            last top-up reaches <strong>$4.75</strong>, you authorize an automatic one-time charge
            of <strong>$8.50</strong> to your payment method on file. This can recur within a
            billing period whenever the threshold is reached.
          </li>
          <li>
            <strong>Spending limit.</strong> You set a pre-approved monthly cap on automatic
            top-ups (default <strong>$25/month</strong>). If a top-up would exceed it, automatic
            charging <strong>pauses</strong> and AI features pause until you raise the cap or the
            next month begins.
          </li>
          <li>
            <strong>Pause on failed payment.</strong> If a charge is declined, AI features pause
            until payment succeeds.
          </li>
          <li>
            <strong>Payment processor.</strong> Payments are processed by <strong>Stripe</strong>.
            You authorize us and Stripe to store your payment method and charge fees as they become
            due.
          </li>
          <li>
            <strong>Price changes.</strong> We may change prices and top-up parameters
            prospectively with reasonable notice.
          </li>
          <li>
            <strong>Taxes.</strong> Stated prices may not include applicable taxes, which you are
            responsible for where required.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "Cancellation, renewal, and refunds",
    content: (
      <ul>
        <li>You may <strong>cancel at any time</strong> through the Platform or by contacting us.</li>
        <li>
          Cancellation <strong>stops future automatic renewals.</strong> You keep access through the
          end of the period you have already paid for.
        </li>
        <li>
          <strong>All fees are non-refundable, and we do not prorate</strong> partial periods,
          except where a refund is required by law.
        </li>
        <li>
          <strong>Cancellation true-up:</strong> When you cancel, you authorize a final charge for
          any metered usage you have already incurred that has not yet been charged.
        </li>
        <li>
          <strong>Data after cancellation:</strong> Your interactive access ends after the paid
          period, but the Firm <strong>retains your client file</strong> under its retention
          policy — generally at least five years. Export anything you want to keep before your
          access ends.
        </li>
      </ul>
    ),
  },
  {
    id: "drafts",
    title: "Documents are drafts until approved",
    content: (
      <p>
        Documents generated on the Platform are <strong>drafts.</strong> Pre-approval drafts are
        watermarked/labeled and <strong>must not be filed, signed, served, or relied upon</strong>{" "}
        until a licensed attorney approves them. The Firm targets attorney review within 48 hours
        for eligible matters but does not guarantee any specific turnaround.{" "}
        <strong>No outcome is guaranteed.</strong>
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You agree <strong>not</strong> to:</p>
        <ul>
          <li>Use the Platform for any unlawful purpose, or to plan or further any crime or fraud</li>
          <li>Provide false information or impersonate another person</li>
          <li>Seek to use the service for matters the Firm has not agreed to handle</li>
          <li>Upload content you have no right to share</li>
          <li>Attempt to access other users&apos; data or breach security</li>
          <li>Scrape, reverse engineer, or misuse the Platform or its AI</li>
          <li>Resell or provide the service to third parties</li>
          <li>Upload malware</li>
        </ul>
        <p>We may suspend or terminate access for violations.</p>
      </>
    ),
  },
  {
    id: "user-content",
    title: "User content and license",
    content: (
      <p>
        You retain ownership of the information and documents you provide. You grant the Firm a
        limited license to use, store, process, and transmit your content solely to provide the
        services, including through the service providers described in the{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>. Documents the Firm prepares and delivers
        to you are yours to use for your matter.
      </p>
    ),
  },
  {
    id: "third-party",
    title: "Third-party services",
    content: (
      <p>
        The Platform relies on third-party providers (AI, hosting/storage, payments, email). Their
        availability and performance are outside our control. We are not responsible for third-party
        acts or omissions beyond our reasonable control.
      </p>
    ),
  },
  {
    id: "warranties",
    title: "Disclaimers of warranties",
    content: (
      <>
        <p>
          Except for the professional duties the Firm owes its Phase II clients under applicable law
          and the Texas Disciplinary Rules of Professional Conduct,{" "}
          <strong>
            the Platform is provided &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE,&rdquo; without
            warranties of any kind,
          </strong>{" "}
          express or implied. We do not warrant that the Platform will be uninterrupted,
          error-free, or secure, or that AI output will be accurate or complete.
        </p>
        <p>
          Nothing in this section disclaims, limits, or waives any duty or liability that cannot be
          disclaimed under applicable law or the Texas Disciplinary Rules.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    content: (
      <>
        <p>
          To the maximum extent permitted by law, and <strong>except for the Firm&apos;s
          professional liability to its clients for legal services (including legal malpractice),
          liability that cannot be limited under Tex. Disciplinary R. 1.08(g), and our
          indemnification obligations:</strong>
        </p>
        <ul>
          <li>
            The Firm will not be liable for indirect, incidental, special, consequential, or punitive
            damages, or lost profits or data, arising from your use of the Platform; and
          </li>
          <li>
            The Firm&apos;s total aggregate liability for the Platform/technology (as distinct from
            legal-services liability) will not exceed the greater of the amounts you paid in the
            twelve months before the claim or $100.
          </li>
        </ul>
        <LegalCallout>
          <strong>Attorney review — critical.</strong> This clause is drafted to{" "}
          <strong>not</strong> limit legal-malpractice or other non-waivable liability to clients
          (Tex. Disciplinary R. 1.08(g)). Confirm the carve-outs are sufficient before publication.
        </LegalCallout>
      </>
    ),
  },
  {
    id: "indemnification",
    title: "Indemnification",
    content: (
      <p>
        You agree to indemnify and hold the Firm harmless from claims arising out of your misuse
        of the Platform, your violation of these Terms or law, or content you upload that you had
        no right to share — except to the extent caused by the Firm&apos;s own wrongdoing.
      </p>
    ),
  },
  {
    id: "arbitration",
    title: "Binding arbitration",
    content: (
      <>
        <p>
          <strong>Please read carefully.</strong> Except as stated below, you and the Firm agree
          that disputes arising out of or relating to the Platform, these Terms, the Firm&apos;s
          services, or fees — including legal-malpractice and fee disputes — will be resolved by{" "}
          <strong>final and binding arbitration on an individual basis</strong>, seated in Texas,
          under the Federal Arbitration Act.
        </p>
        <p>
          Arbitration means <strong>you waive your right to a judge or jury trial and most rights to
          appeal.</strong> This changes only the forum; it does <strong>not</strong> cap, reduce,
          or waive the Firm&apos;s substantive liability (including for legal malpractice). You may,
          and are encouraged to, consult an independent attorney before agreeing.
        </p>
        <p>This section does not apply to, and does not waive:</p>
        <ul>
          <li>Your right to file a grievance with the State Bar of Texas</li>
          <li>Any claim that by law cannot be arbitrated</li>
          <li>Small-claims matters</li>
          <li>Requests for emergency or injunctive relief</li>
        </ul>
        <LegalCallout>
          <strong>Attorney review.</strong> Confirm administrator (AAA vs. JAMS), seat/county, class
          waiver, opt-out period, and consumer-protection considerations before publication.
        </LegalCallout>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law and venue",
    content: (
      <p>
        These Terms are governed by the laws of the State of Texas. For any matter not subject to
        arbitration, the exclusive venue is the state and federal courts located in Texas.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    content: (
      <p>
        We may update these Terms prospectively. Material changes will be communicated through the
        Platform or by email. For Phase II clients, material changes affecting the engagement will
        be presented for acceptance.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    content: (
      <p>
        We may suspend or terminate your access for violation of these Terms or as required by our
        professional obligations. Sections that by their nature should survive (including user
        content, warranties, liability, and governing law) survive termination.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Crawford Law PLLC · Texas Bar #24148908 · www.instant-attorney.com
      </p>
    ),
  },
];
