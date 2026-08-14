"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const VISITOR_KEY = "ia_visitor_id";
const SESSION_KEY = "ia_session_id";

function getId(storage: Storage, key: string): string {
  const current = storage.getItem(key);
  if (current) return current;
  const created = crypto.randomUUID();
  storage.setItem(key, created);
  return created;
}

/** First-party, privacy-minimal page analytics. The API discards URL query strings. */
export default function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const payload = {
      path: pathname,
      visitorId: getId(localStorage, VISITOR_KEY),
      sessionId: getId(sessionStorage, SESSION_KEY),
      referrer: document.referrer,
      utmSource: searchParams.get("utm_source"),
      utmMedium: searchParams.get("utm_medium"),
      utmCampaign: searchParams.get("utm_campaign"),
    };
    void fetch("/api/analytics/page-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  }, [pathname, searchParams]);

  return null;
}
