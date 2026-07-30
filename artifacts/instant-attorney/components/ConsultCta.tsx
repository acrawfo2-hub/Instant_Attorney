"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Persistent "Schedule a consult with Crawford Law" button. Floats in the corner
// on almost every client view so booking a live session is always one click away.
// The scheduling page itself gates subscribers vs. non-subscribers (and routes a
// non-subscriber to the consult upgrade), so this button just points there.
//
// Hidden where it would be redundant or wrong: the chat composer view (kept clean
// and uncluttered), the consult flow itself, auth/onboarding/marketing, and every
// attorney-side surface (attorneys aren't scheduling a consult with themselves).
const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/onboarding",
  "/consult",
  "/attorney",
  "/admin",
  "/chat",
  "/free-chat",
];

export default function ConsultCta() {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/account/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        // Only signed-in consumer clients — never attorney-users or Crawford staff.
        setIsClient(!data.is_attorney && data.account_type === "client");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const hidden =
    pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isClient || hidden) return null;

  return (
    <Link href="/consult/schedule" className="consult-fab" title="Book a live 30-minute strategy session with Andrew Crawford, Esq.">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <span className="consult-fab-label">Schedule a consult with Crawford Law</span>
    </Link>
  );
}
