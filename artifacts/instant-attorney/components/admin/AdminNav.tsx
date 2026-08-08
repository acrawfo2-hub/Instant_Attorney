"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/attorney-signups", label: "Attorney Signups" },
  { href: "/admin/archives", label: "Archives" },
] as const;

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav">
      {TABS.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "admin-nav-tab admin-nav-tab-active" : "admin-nav-tab"}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
