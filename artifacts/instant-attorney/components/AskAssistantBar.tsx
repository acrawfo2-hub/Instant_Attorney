import Link from "next/link";

// The persistent way into the conversation. Chat is almost always the right
// next step from the cover sheet, so this bar stays on the file — phones and
// wide screens — with the same words as the cover button.

export default function AskAssistantBar({ href }: { href: string }) {
  return (
    <div className="lf-askbar">
      <Link href={href} className="lf-askbar-btn">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        Talk with your assistant
      </Link>
    </div>
  );
}
