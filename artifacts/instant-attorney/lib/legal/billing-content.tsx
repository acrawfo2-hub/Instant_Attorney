import Link from "next/link";
import { LegalCallout } from "@/lib/legal/callouts";
import type { LegalDocumentMeta, LegalSection } from "@/lib/legal/types";

export const BILLING_META: LegalDocumentMeta = {
  title: "Billing, Automatic Renewal & Refund Disclosure",
  subtitle:
    "A clear and conspicuous summary of the charges you authorize when you subscribe to Phase II.",
  version: "Draft v1.0 — pending attorney review",
  effectiveDate: "[TO BE SET]",
  footerNote:
    "This disclosure supplements the Terms of Service and your Representation Agreement. It is shown before you pay, with your affirmative consent.",
};

export const BILLING_SECTIONS: LegalSection[] = [
  {
    id: "summary",
    title: "What you are signing up for",
    content: (
      <>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Amount</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Subscription</strong></td>
                <td><strong>$9.99 / month</strong></td>
                <td>Charged today and <strong>automatically every month</strong> until you cancel</td>
              </tr>
              <tr>
                <td><strong>Automatic usage top-up</strong></td>
                <td><strong>$8.50 each</strong></td>
                <td>
                  Charged automatically each time metered AI usage since your last top-up reaches{" "}
                  <strong>$4.75</strong>. Can happen more than once per month.
                </td>
              </tr>
              <tr>
                <td><strong>Your monthly cap on top-ups</strong></td>
                <td>Default <strong>$25 / month</strong> (you can change it)</td>
                <td>Automatic top-ups <strong>pause</strong> once they would exceed your cap</td>
              </tr>
              <tr>
                <td><strong>Phase III consult</strong> (optional)</td>
                <td><strong>$49.99</strong> one-time</td>
                <td>Only if you book one</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>These are recurring and usage-based charges.</strong> By subscribing, you
          authorize Crawford Law PLLC and Stripe to store your payment method and to make the
          charges above automatically as they come due.
        </p>
        <LegalCallout>
          <strong>Attorney/compliance review.</strong> Confirm required disclosures and consent
          mechanics for each state where you enroll customers before launch.
        </LegalCallout>
      </>
    ),
  },
  {
    id: "top-ups",
    title: "How automatic usage top-ups work",
    content: (
      <ul>
        <li>The Platform meters the cost of the AI you use as you generate and analyze documents</li>
        <li>
          When that running total reaches <strong>$4.75</strong>, an <strong>$8.50</strong> top-up
          is charged automatically to your card on file
        </li>
        <li>This protects against interruptions mid-work and can recur whenever you reach the threshold again</li>
        <li>
          <strong>You stay in control with your monthly cap.</strong> Once automatic top-ups would
          exceed your cap (default <strong>$25</strong>), we stop charging automatically and pause
          AI features until you raise the cap or the next month begins
        </li>
        <li>
          If a charge is <strong>declined</strong>, AI features pause until you update your card
          and payment succeeds
        </li>
      </ul>
    ),
  },
  {
    id: "cancellation",
    title: "Renewal, cancellation, and refunds",
    content: (
      <ul>
        <li>Your subscription <strong>renews automatically every month</strong> until you cancel</li>
        <li>
          <strong>You can cancel anytime</strong> on the Platform (Account → Billing) or by
          contacting us. Cancellation is simple and does not require talking to anyone
        </li>
        <li>
          When you cancel: automatic renewal stops; you keep access through the end of the period
          you already paid for; <strong>fees already paid are non-refundable and are not
          prorated</strong> (except where required by law)
        </li>
        <li>
          <strong>Cancellation true-up:</strong> at cancellation, you authorize a final charge for
          AI usage you already incurred that has not yet been charged
        </li>
      </ul>
    ),
  },
  {
    id: "data",
    title: "What happens to your data when you cancel",
    content: (
      <p>
        Your interactive access ends after the paid period. The Firm then{" "}
        <strong>retains your client file</strong> under its retention policy — generally at least
        five years, longer for certain records — and you may <strong>request a copy</strong> during
        that period. <strong>Please export anything you want to keep before your access ends.</strong>
      </p>
    ),
  },
  {
    id: "consent",
    title: "Your affirmative consent",
    content: (
      <>
        <p>By checking the consent box and subscribing, you confirm that you have read and agree to:</p>
        <ul>
          <li>The <strong>recurring $9.99/month charge</strong></li>
          <li>
            The <strong>automatic $8.50 usage top-ups</strong> at the <strong>$4.75</strong>{" "}
            threshold up to your monthly cap
          </li>
          <li>The <strong>no-refund / no-proration</strong> policy</li>
          <li>The <strong>cancellation true-up</strong></li>
          <li>The <strong>file-retention practice</strong> described above</li>
          <li>
            The <strong>binding arbitration</strong> provision in the{" "}
            <Link href="/legal/terms">Terms of Service</Link> and Representation Agreement
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "questions",
    title: "Questions about charges",
    content: (
      <p>
        Contact Crawford Law PLLC with billing questions. Receipts are available from Stripe and
        in your account under Account → Billing.
      </p>
    ),
  },
];
