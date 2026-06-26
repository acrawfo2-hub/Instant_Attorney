import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import { PRIVACY_META, PRIVACY_SECTIONS } from "@/lib/legal/privacy-content";

export const metadata: Metadata = {
  title: "Privacy Policy — Instant-Attorney · Crawford Law PLLC",
  description: "Privacy Policy for the Instant Attorney platform operated by Crawford Law PLLC.",
};

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      title={PRIVACY_META.title}
      subtitle={PRIVACY_META.subtitle}
      version={PRIVACY_META.version}
      effectiveDate={PRIVACY_META.effectiveDate}
      footerNote={PRIVACY_META.footerNote}
      sections={PRIVACY_SECTIONS}
    />
  );
}
