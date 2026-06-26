import Link from "next/link";
import type { LegalDocumentMeta, LegalSection } from "@/lib/legal/types";

export const DISCLAIMERS_META: LegalDocumentMeta = {
  title: "Legal Disclaimers & Advertising Disclosures",
  subtitle:
    "Site-wide disclaimers and attorney-advertising disclosures for Instant Attorney.",
  version: "Draft v1.0 — pending attorney review",
  effectiveDate: "[TO BE SET]",
  footerNote:
    "These disclaimers apply across the Instant Attorney website and platform and are incorporated into the Terms of Service.",
};

export const DISCLAIMERS_SECTIONS: LegalSection[] = [
  {
    id: "advertising",
    title: "Attorney advertising",
    content: (
      <p>
        This website is an advertisement for legal services by <strong>Crawford Law PLLC</strong>,
        a Texas professional limited liability company. <strong>Responsible attorney: Andrew
        Crawford, Esq.</strong>, Texas Bar #24148908. The Firm&apos;s attorneys are licensed in{" "}
        <strong>Texas and Illinois</strong> only.
      </p>
    ),
  },
  {
    id: "phase-i",
    title: "Phase I is not legal advice",
    content: (
      <p>
        Phase I and other free content provide <strong>general legal information only</strong>.
        They are <strong>not legal advice</strong>, do <strong>not</strong> create an
        attorney-client relationship, and are <strong>not</strong> protected by attorney-client
        privilege. Do not share confidential or sensitive information in Phase I, and do not act or
        refrain from acting based on Phase I content without consulting a licensed attorney about
        your specific situation.
      </p>
    ),
  },
  {
    id: "relationship",
    title: "When a relationship and privilege begin",
    content: (
      <p>
        An attorney-client relationship is formed only when you sign the Firm&apos;s Representation
        Agreement, your subscription is active, and the Firm has completed its conflicts check and
        accepted the engagement. Communications made afterward to obtain legal services are intended
        to be privileged, <strong>subject to limits</strong> (including the crime-fraud exception
        and waiver by third-party disclosure). <strong>Privilege is applied by courts and cannot
        be guaranteed in every proceeding.</strong>
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI-assisted services",
    content: (
      <>
        <p>
          Documents and analysis are produced with the assistance of AI and{" "}
          <strong>reviewed by a licensed attorney before delivery as approved.</strong> Pre-approval
          drafts are labeled and <strong>must not be filed, signed, or relied upon</strong> until
          approved. AI can make mistakes; attorney review is the safeguard, but no process is
          perfect.
        </p>
        <p>
          Read our full <Link href="/legal/ai-philosophy">AI Philosophy Statement</Link> for how we
          use AI responsibly.
        </p>
      </>
    ),
  },
  {
    id: "no-guarantee",
    title: "No guarantee of results",
    content: (
      <p>
        <strong>No result or outcome is guaranteed.</strong> Past results, examples, and general
        descriptions do not predict or guarantee a similar outcome in your matter. Any statement
        about the law or your situation is a professional assessment, not a promise.
      </p>
    ),
  },
  {
    id: "jurisdiction",
    title: "Jurisdiction",
    content: (
      <p>
        The Firm practices only where its attorneys are licensed (Texas and Illinois). Content for
        other jurisdictions is general information and may require local counsel.
      </p>
    ),
  },
  {
    id: "emergencies",
    title: "Not for emergencies",
    content: (
      <p>
        The Platform is not for emergencies or urgent deadlines. If you face an imminent deadline,
        court date, or emergency, seek appropriate help immediately.
      </p>
    ),
  },
  {
    id: "third-party",
    title: "Third-party links and services",
    content: (
      <p>
        The Platform relies on and may link to third-party services. We are not responsible for
        third-party content or practices beyond our reasonable control.
      </p>
    ),
  },
  {
    id: "billing",
    title: "Billing summary",
    content: (
      <p>
        Phase II is a recurring <strong>$9.99/month</strong> subscription with{" "}
        <strong>automatic $8.50 usage top-ups</strong> (at a $4.75 usage threshold) up to your
        monthly cap, <strong>no refunds/no proration</strong>, and a cancellation true-up. See
        the <Link href="/legal/billing">Billing &amp; Refund Disclosure</Link> for full detail.
      </p>
    ),
  },
];
