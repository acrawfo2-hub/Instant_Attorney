import type { Metadata } from "next";
import LegalDocumentPage from "@/components/LegalDocumentPage";
import {
  AI_PHILOSOPHY_META,
  AI_PHILOSOPHY_SECTIONS,
} from "@/lib/legal/ai-philosophy-content";

export const metadata: Metadata = {
  title: "Our Philosophy on AI — Instant-Attorney · Crawford Law PLLC",
  description:
    "How Crawford Law PLLC uses artificial intelligence responsibly, with a licensed attorney always in the loop. Texas Ethics Opinion 705 aligned.",
};

export default function AiPhilosophyPage() {
  return (
    <LegalDocumentPage
      title={AI_PHILOSOPHY_META.title}
      subtitle={AI_PHILOSOPHY_META.subtitle}
      version={AI_PHILOSOPHY_META.version}
      effectiveDate={AI_PHILOSOPHY_META.effectiveDate}
      footerNote={AI_PHILOSOPHY_META.footerNote}
      sections={AI_PHILOSOPHY_SECTIONS}
    />
  );
}
