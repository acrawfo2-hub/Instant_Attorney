import Link from "next/link";
import type { CaseFile } from "@/lib/types";
import type { MatterTasksResult } from "@/lib/matter-tasks";
import type { FileDeck } from "@/lib/file-deck";

// Keep the landing page focused on orientation and one clear action. Supporting
// work remains available in Drafted documents, Uploads, and the legal chat.

const ArrowIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function CaseHub({
  caseFile,
  deck,
}: {
  caseFile: CaseFile;
  tasks: MatterTasksResult;
  deck: FileDeck;
}) {
  const chatHref = `/chat?caseFileId=${caseFile.id}`;
  const askHref = (ask: string) => `${chatHref}&ask=${encodeURIComponent(ask)}`;

  return (
    <section className="lf-hub">
      <div className="lf-hub-head">
        <div className="lf-hub-headings">
          <h2 className="lf-hub-title">Where things stand</h2>
          <p className="lf-hub-live">
            <span className="lf-hub-livedot" aria-hidden />
            Kept current as you talk in your legal chat
          </p>
        </div>
      </div>

      {caseFile.chat_session_summary && (
        <p className="lf-hub-recap">
          <span className="lf-hub-recap-k">Last time</span>
          {caseFile.chat_session_summary}
        </p>
      )}

      {/* ── The next step, and the way to take it ───────────────────────────── */}
      <div
        className={`lf-next${deck.nextStep ? ` lf-next-${deck.nextStep.urgency}` : ""}`}
      >
        <div className="lf-next-eyebrow">
          {deck.nextStep ? "Your next step" : "Start here"}
        </div>
        <p className="lf-next-title">
          {deck.nextStep
            ? deck.nextStep.title
            : "Tell us what's going on in your legal chat — it'll build your file from there"}
        </p>
        {deck.nextStep?.detail && (
          <p className="lf-next-detail">{deck.nextStep.detail}</p>
        )}

        <Link
          href={deck.nextStep ? askHref(deck.nextStep.ask) : chatHref}
          className="lf-next-cta"
        >
          Continue legal chat
          <ArrowIcon />
        </Link>
        <p className="lf-next-cta-sub">
          Updates you accept in chat refresh your case file.
        </p>
      </div>
    </section>
  );
}
