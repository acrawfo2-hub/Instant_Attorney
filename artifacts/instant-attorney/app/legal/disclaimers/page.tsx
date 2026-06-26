import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import { DISCLAIMERS_META, DISCLAIMERS_SECTIONS } from "@/lib/legal/disclaimers-content";

export const metadata: Metadata = {
  title: "Legal Disclaimers — Instant-Attorney · Crawford Law PLLC",
  description:
    "Site-wide legal disclaimers and attorney advertising disclosures for Instant Attorney.",
};

export default function DisclaimersPage() {
  return (
    <LegalDocumentPage
      title={DISCLAIMERS_META.title}
      subtitle={DISCLAIMERS_META.subtitle}
      version={DISCLAIMERS_META.version}
      effectiveDate={DISCLAIMERS_META.effectiveDate}
      footerNote={DISCLAIMERS_META.footerNote}
      sections={DISCLAIMERS_SECTIONS}
    />
  );
}
