import type { NextStepGuide } from "./next-step";

export interface CaseHeaderCta {
  label: string;
  href: string;
}

/**
 * Single source of truth for the Living File header button — derived from the
 * same next-step engine that powers Mission Control.
 */
export function getCaseHeaderCta(
  guide: NextStepGuide,
  caseFileId: string,
): CaseHeaderCta {
  const chatHref = `/chat?caseFileId=${caseFileId}`;

  if (guide.cta?.href.startsWith("/chat")) {
    return { label: shortLabel(guide.cta.label, "Continue conversation"), href: guide.cta.href };
  }

  switch (guide.activeStep) {
    case 1:
      return { label: "Continue conversation", href: chatHref };
    case 2:
      return guide.cta
        ? { label: shortLabel(guide.cta.label, "Create document"), href: guide.cta.href }
        : { label: "Create document", href: chatHref };
    case 3:
      return guide.cta
        ? { label: shortLabel(guide.cta.label, "Review draft"), href: guide.cta.href }
        : { label: "Review your draft", href: `#documents` };
    case 4:
      return { label: "View review status", href: "#documents" };
    case 5:
      return guide.cta
        ? { label: shortLabel(guide.cta.label, "Get your document"), href: guide.cta.href }
        : { label: "Get your document", href: "#documents" };
    default:
      return { label: "Open your case", href: chatHref };
  }
}

/** Strip trailing arrows and keep labels button-friendly. */
function shortLabel(raw: string, fallback: string): string {
  const trimmed = raw.replace(/\s*→\s*$/, "").trim();
  return trimmed.length > 42 ? fallback : trimmed;
}
