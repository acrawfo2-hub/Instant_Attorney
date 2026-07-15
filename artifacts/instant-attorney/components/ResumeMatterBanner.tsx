"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LAST_MATTER_STORAGE_KEY,
  type MatterSwitcherItem,
} from "@/lib/matter-switcher";

/**
 * On the multi-file dashboard, offer a one-click resume to the last Living File
 * this browser opened — without auto-redirecting away from the matter index.
 */
export default function ResumeMatterBanner({
  matters,
}: {
  matters: MatterSwitcherItem[];
}) {
  const [resume, setResume] = useState<MatterSwitcherItem | null>(null);

  useEffect(() => {
    try {
      const id = localStorage.getItem(LAST_MATTER_STORAGE_KEY);
      if (!id) return;
      const match = matters.find((m) => m.id === id);
      if (match) setResume(match);
    } catch {
      /* ignore */
    }
  }, [matters]);

  if (!resume || matters.length < 2) return null;

  return (
    <div className="dash-resume">
      <div className="dash-resume-copy">
        <span className="dash-resume-label">Continue</span>
        <span className="dash-resume-title">{resume.title}</span>
        {resume.next_action && (
          <span className="dash-resume-next">{resume.next_action}</span>
        )}
      </div>
      <Link href={`/dashboard/${resume.id}`} className="dash-btn dash-btn-primary">
        Open Living File
      </Link>
    </div>
  );
}
