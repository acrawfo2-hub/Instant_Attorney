import type { ReactNode } from "react";

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

export const AI_PHILOSOPHY_META = {
  title: "Our Philosophy on Artificial Intelligence",
  subtitle:
    "How Crawford Law PLLC uses AI responsibly — with a licensed attorney always in the loop.",
  version: "Draft v1.0 — pending attorney review",
  effectiveDate: "[TO BE SET]",
};

export const AI_PHILOSOPHY_SECTIONS: LegalSection[] = [
  {
    id: "why",
    title: "Why we use AI",
    content: (
      <>
        <p>
          Legal problems are often expensive to address because traditional attorney time is
          scarce and costly. Many people never get help — not because the law is unknowable,
          but because organizing facts, understanding options, and preparing documents takes
          more time and money than they can afford.
        </p>
        <p>
          We believe artificial intelligence, used responsibly and under attorney supervision,
          can change that equation without sacrificing the judgment, empathy, and accountability
          that only a licensed human attorney can provide.
        </p>
        <p>Our philosophy rests on three convictions:</p>
        <ol>
          <li>
            <strong>AI is exceptionally good at helping people understand what the law is.</strong>{" "}
            Large language models can synthesize statutes, rules, and common legal concepts into
            plain English, help a person see the legal landscape around their situation, and
            surface issues they might not have known to ask about.
          </li>
          <li>
            <strong>AI is exceptionally good at organizing facts into a useful file.</strong>{" "}
            Through structured intake, AI can help gather, categorize, and present a person&apos;s
            story — dates, parties, documents, open questions — in a Living File that makes
            attorney review faster and more focused.
          </li>
          <li>
            <strong>A licensed attorney must always be in the loop.</strong> AI does not exercise
            legal judgment, does not form an attorney-client relationship on its own, and cannot
            replace the human considerations — context, empathy, strategy, ethics, and
            accountability — that legal representation requires. Every AI-assisted output that
            matters is reviewed by a licensed attorney before it is delivered to a client as
            approved.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "what-ai-does",
    title: "What AI does in our practice",
    content: (
      <>
        <p>Depending on which phase of the platform you use, AI may assist with:</p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th>Function</th>
                <th>Phase I (Free)</th>
                <th>Phase II (Subscriber)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>General legal information in plain English</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Structured fact-gathering and Living File</td>
                <td>Limited</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Legal issue identification and pathway analysis</td>
                <td>Limited</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Document drafting</td>
                <td>No</td>
                <td>Yes (pre-review only until attorney approves)</td>
              </tr>
              <tr>
                <td>Attorney review before delivery</td>
                <td>No</td>
                <td>Yes</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>Phase I</strong> uses AI to provide general legal information. It does{" "}
          <strong>not</strong> create an attorney-client relationship, is <strong>not</strong>{" "}
          protected by privilege, and is <strong>not</strong> legal advice. Do not share
          confidential or sensitive facts in Phase I.
        </p>
        <p>
          <strong>Phase II</strong> uses AI within a signed representation agreement. AI assists
          intake, analysis, and drafting; a licensed attorney supervises the process and reviews
          documents before they are delivered as attorney-approved.
        </p>
      </>
    ),
  },
  {
    id: "what-ai-does-not",
    title: "What AI does not do",
    content: (
      <>
        <p>
          To be direct about limitations — because candor is an ethical obligation, not a
          marketing inconvenience:
        </p>
        <ul>
          <li>
            <strong>AI is not your attorney.</strong> It is a tool Crawford Law uses under
            attorney supervision. It does not hold a law license and cannot be held accountable
            in the ways a human lawyer can.
          </li>
          <li>
            <strong>AI can be wrong.</strong> Generative AI systems can produce incomplete,
            outdated, or fabricated information — including citations and legal conclusions that
            sound authoritative but are not (&ldquo;hallucinations&rdquo;). We do not ask you to
            trust AI output. We ask you to trust the <strong>attorney review process</strong>{" "}
            that follows it, while understanding that no process is perfect.
          </li>
          <li>
            <strong>AI does not guarantee outcomes.</strong> No result in any legal matter is
            guaranteed. AI-assisted analysis is a starting point for professional judgment, not a
            prediction of what a court, agency, or opposing party will do.
          </li>
          <li>
            <strong>AI does not replace human judgment on matters that require it.</strong>{" "}
            Decisions involving your safety, your children, your liberty, your livelihood, or your
            fundamental rights deserve human attention. We use AI to make attorney time more
            efficient and accessible — not to remove the attorney from decisions that require
            human wisdom.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "attorney-in-loop",
    title: "The attorney always in the loop",
    content: (
      <>
        <p>
          This is not a product feature we chose for differentiation. It is an ethical
          requirement under the Texas Disciplinary Rules and Texas Ethics Opinion 705.
        </p>
        <ol>
          <li>
            <strong>Supervision.</strong> A licensed attorney (Andrew Crawford, Esq.) supervises
            how AI is used in client matters and is responsible for the work product delivered.
          </li>
          <li>
            <strong>Review before delivery.</strong> AI-generated documents are labeled as
            pre-review and watermarked until a licensed attorney reviews and approves them.
            Pre-review drafts must not be filed, signed, or relied upon.
          </li>
          <li>
            <strong>Independent verification.</strong> We do not blindly rely on AI research,
            citations, or legal conclusions. Attorney review includes checking accuracy,
            completeness, and fitness for the client&apos;s specific situation.
          </li>
          <li>
            <strong>Competence.</strong> We maintain a current, reasonable understanding of the AI
            tools we use, their capabilities, and their risks — as Opinion 705 requires.
          </li>
          <li>
            <strong>Communication.</strong> We tell clients that AI is used, how it is used, and
            what its limitations are — through this statement, onboarding consent, and the AI
            Consent document.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "confidentiality",
    title: "How we protect your information",
    content: (
      <>
        <p>
          Confidentiality is non-negotiable. Under Tex. Disciplinary R. Prof. Conduct 1.05, we
          treat Phase II client information as confidential.
        </p>
        <ul>
          <li>
            <strong>Single AI provider.</strong> We use Anthropic, PBC as our AI inference
            provider, deliberately limiting vendor complexity so we can enforce strong data-handling
            terms.
          </li>
          <li>
            <strong>No training on your content.</strong> We do not permit your communications to
            be used to train AI models.
          </li>
          <li>
            <strong>Zero-data-retention (ZDR).</strong> We are implementing ZDR processing with our
            AI provider before public launch, so that prompt and output content is not retained by
            the provider.
          </li>
          <li>
            <strong>Vetted service providers.</strong> Cloud hosting, payments, and email are
            handled by service providers under contractual confidentiality and data-protection
            obligations.
          </li>
          <li>
            <strong>Informed consent.</strong> Before Phase II services begin, you sign an AI
            Consent document that describes third-party processing and your right to revoke
            consent.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "access-to-justice",
    title: "Access to justice — without cutting corners",
    content: (
      <>
        <p>
          We use AI because we believe more people deserve to understand their legal situation
          and take meaningful steps — not because we believe legal services should be automated
          away.
        </p>
        <p>
          Traditional full-scope representation is the right answer for many matters. It is also
          out of reach for many people. Our limited-scope, AI-assisted model is designed to help
          people who might otherwise do nothing: understand the law, organize their facts, receive
          attorney-reviewed documents, and decide — with real information — whether and how to
          proceed.
        </p>
        <p>
          Lower cost does not mean lower ethical standards. The same rules of professional conduct
          apply whether an attorney spends ten hours on a matter or uses AI to make those ten
          hours more productive.
        </p>
      </>
    ),
  },
  {
    id: "billing",
    title: "Billing and AI usage",
    content: (
      <>
        <p>We are transparent about how AI usage affects fees:</p>
        <ul>
          <li>
            The Phase II subscription and automatic usage top-ups are described in your
            Representation Agreement and the Billing &amp; Refund Disclosure.
          </li>
          <li>
            We do not charge hourly rates for time saved by AI in ways that would be misleading
            under Opinion 705 and Rule 1.04 (fees).
          </li>
          <li>
            AI usage has a real cost; that cost is reflected in our subscription and metered
            top-up structure, not hidden.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights and choices",
    content: (
      <ul>
        <li>
          <strong>Read before you sign.</strong> This philosophy statement, the AI Consent, and
          the Representation Agreement are available before you subscribe.
        </li>
        <li>
          <strong>Revoke consent.</strong> You may revoke AI consent at any time by contacting the
          Firm in writing. Because AI assistance is integral to how the platform works, revocation
          generally means we can no longer provide platform services.
        </li>
        <li>
          <strong>Raise concerns.</strong> If any AI-assisted output seems wrong, incomplete, or
          inappropriate, contact us before acting on it.
        </li>
        <li>
          <strong>Export your data.</strong> You may export your documents and Living File during
          your engagement.
        </li>
      </ul>
    ),
  },
  {
    id: "commitments",
    title: "Our ethical commitments",
    content: (
      <>
        <p>
          We commit to the following practices, aligned with Texas Ethics Opinion 705 and the
          Texas Disciplinary Rules:
        </p>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th>Obligation</th>
                <th>Our practice</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Competence (Rule 1.01)</td>
                <td>Maintain current understanding of AI tools; verify all AI output</td>
              </tr>
              <tr>
                <td>Confidentiality (Rule 1.05)</td>
                <td>Treat Phase II data as confidential; vet providers; obtain consent</td>
              </tr>
              <tr>
                <td>Diligence (Rule 1.03)</td>
                <td>Attorney review of AI-generated documents before delivery</td>
              </tr>
              <tr>
                <td>Communication (Rule 1.03)</td>
                <td>Disclose AI use; explain limitations; respond to client concerns</td>
              </tr>
              <tr>
                <td>Candor (Rule 3.03)</td>
                <td>Do not overstate AI capabilities; label pre-review drafts accurately</td>
              </tr>
              <tr>
                <td>Fees (Rule 1.04)</td>
                <td>Transparent subscription and usage billing; no deceptive hourly padding</td>
              </tr>
              <tr>
                <td>Advertising (Rule 7.0x)</td>
                <td>Accurate, non-misleading statements about AI and privilege</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "questions",
    title: "Questions",
    content: (
      <>
        <p>If you have questions about how we use AI, contact:</p>
        <p>
          <strong>Crawford Law PLLC</strong>
          <br />
          Andrew Crawford, Esq. · Texas Bar #24148908
          <br />
          www.instant-attorney.com
        </p>
      </>
    ),
  },
];
