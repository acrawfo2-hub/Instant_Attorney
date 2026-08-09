import Link from "next/link";

// A persistent way back into the conversation, pinned to the bottom of the file
// on phones. On a small screen the hero CTA scrolls away within a swipe or two,
// and once it does the assistant is invisible again — which is the exact
// complaint this redesign is answering. Hidden on wide screens (CSS), where the
// hero CTA and the header button are both always reachable.

export default function AskAssistantBar({ href }: { href: string }) {
  return (
    <div className="lf-askbar">
      <Link href={href} className="lf-askbar-btn">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        Continue with your assistant
      </Link>
    </div>
  );
}
