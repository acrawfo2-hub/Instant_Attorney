import type { ReactNode } from "react";

export function LegalCallout({
  children,
  variant = "warning",
}: {
  children: ReactNode;
  variant?: "warning" | "info";
}) {
  return <div className={`legal-callout legal-callout-${variant}`}>{children}</div>;
}
