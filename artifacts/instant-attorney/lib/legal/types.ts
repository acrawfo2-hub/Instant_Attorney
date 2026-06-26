import type { ReactNode } from "react";

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

export interface LegalDocumentMeta {
  title: string;
  subtitle: string;
  version: string;
  effectiveDate?: string;
  footerNote?: string;
}
