import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import { TERMS_META, TERMS_SECTIONS } from "@/lib/legal/terms-content";

export const metadata: Metadata = {
  title: "Terms of Service — Instant-Attorney · Crawford Law PLLC",
  description: "Terms of Service for the Instant Attorney platform operated by Crawford Law PLLC.",
};

export default function TermsPage() {
  return (
    <LegalDocumentPage
      title={TERMS_META.title}
      subtitle={TERMS_META.subtitle}
      version={TERMS_META.version}
      effectiveDate={TERMS_META.effectiveDate}
      footerNote={TERMS_META.footerNote}
      sections={TERMS_SECTIONS}
    />
  );
}
