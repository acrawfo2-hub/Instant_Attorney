import Link from "next/link";
import type { PressingDeadline } from "@/lib/file-deck";

// The first discipline of practicing law is the calendar, so the first thing on
// the file is the one date that could hurt — and only when there is one. A single
// line, at the top, with the question already written. The full docket (basis,
// explanation, caveat) stays in the Key dates section; this is the alarm, not
// the reference.

export default function FileAlertStrip({
  pressing,
  chatHref,
}: {
  pressing: PressingDeadline;
  chatHref: string;
}) {
  const expired = pressing.urgency === "expired";
  return (
    <div className={`lf-alert lf-alert-${pressing.urgency}`} role="alert">
      <svg className="lf-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12" y2="17" />
      </svg>
      <span className="lf-alert-body">
        <span className="lf-alert-label">{expired ? "A deadline has passed" : "Time-sensitive"}</span>
        <span className="lf-alert-msg">
          {pressing.label} — <strong>{pressing.countdown}</strong>
        </span>
      </span>
      <Link href={`${chatHref}&ask=${encodeURIComponent(pressing.ask)}`} className="lf-alert-cta">
        {expired ? "What are my options?" : "What do I do?"}
      </Link>
    </div>
  );
}
