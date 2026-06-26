import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import { BILLING_META, BILLING_SECTIONS } from "@/lib/legal/billing-content";

export const metadata: Metadata = {
  title: "Billing & Refund Disclosure — Instant-Attorney · Crawford Law PLLC",
  description:
    "Billing, automatic renewal, and refund disclosure for Instant Attorney Phase II subscription.",
};

export default function BillingPage() {
  return (
    <LegalDocumentPage
      title={BILLING_META.title}
      subtitle={BILLING_META.subtitle}
      version={BILLING_META.version}
      effectiveDate={BILLING_META.effectiveDate}
      footerNote={BILLING_META.footerNote}
      sections={BILLING_SECTIONS}
    />
  );
}
