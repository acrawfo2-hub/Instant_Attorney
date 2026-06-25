import type { ReactNode } from "react";
import { requireSubscription } from "@/lib/require-onboarding";

export default async function ChatLayout({ children }: { children: ReactNode }) {
  await requireSubscription();
  return <>{children}</>;
}
