"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AttorneyTab {
  href: string;
  label: string;
  badge?: number;
}

export default function AttorneyTabNav({ tabs }: { tabs: AttorneyTab[] }) {
  const pathname = usePathname();

  return (
    <nav className="atty-tabs">
      <div className="atty-tabs-inner">
        {tabs.map((tab) => {
          const active = tab.href === "/attorney" ? pathname === "/attorney" : pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} className={`atty-tab${active ? " atty-tab-active" : ""}`}>
              {tab.label}
              {typeof tab.badge === "number" && tab.badge > 0 && <span className="atty-tab-badge">{tab.badge}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
