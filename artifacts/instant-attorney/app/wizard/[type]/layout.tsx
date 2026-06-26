import type { ReactNode } from "react";
import { requireSubscription } from "@/lib/require-onboarding";

export default async function WizardLayout({ children }: { children: ReactNode }) {
  await requireSubscription();
  return <>{children}</>;
}
