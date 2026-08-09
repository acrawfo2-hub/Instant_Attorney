import Link from "next/link";
import type { CaseFile } from "@/lib/types";
import type { MatterTasksResult, MatterTask } from "@/lib/matter-tasks";
import type { FileDeck } from "@/lib/file-deck";

// The consumer file's one live block, and the only thing above the fold that
// asks the client to do something. It answers, in a lawyer's order:
//
//   "Where were we?"   → the recap
//   "What do I do?"    → ONE next step, with one unmissable button
//   "What else?"       → the rest of the open list, compact
//   "Where's my work?" → drafts already written, one tap from here
//
// The continue-the-conversation button is deliberately the largest thing on the
// page: the recurring complaint was that the assistant read as hidden, and a
// quiet text link in a header is exactly how that happens. The starter chips
// exist for the same reason — a client who doesn't know what to say won't press
// a button that only says "chat", so the file offers the sentences itself.

const URGENCY_DOT: Record<string, string> = {
  expired: "lf-hub-dot-crit",
  critical: "lf-hub-dot-crit",
  warning: "lf-hub-dot-warn",
  normal: "lf-hub-dot-normal",
};

const ArrowIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function Item({ t }: { t: MatterTask }) {
  return (
    <li className="lf-hub-item">
      <span className={`lf-hub-dot ${URGENCY_DOT[t.urgency] ?? "lf-hub-dot-normal"}`} aria-hidden />
      <span className="lf-hub-item-body">
        {t.href ? (
          <Link className="lf-hub-item-title" href={t.href}>{t.title}</Link>
        ) : (
          <span className="lf-hub-item-title">{t.title}</span>
        )}
        {t.blockedBy?.length ? (
          <span className="lf-hub-item-sub">Waiting on: {t.blockedBy.join(", ")}</span>
        ) : null}
      </span>
    </li>
  );
}

export default function CaseHub({
  caseFile,
  tasks,
  deck,
}: {
  caseFile: CaseFile;
  tasks: MatterTasksResult;
  deck: FileDeck;
}) {
  const chatHref = `/chat?caseFileId=${caseFile.id}`;
  const askHref = (ask: string) => `${chatHref}&ask=${encodeURIComponent(ask)}`;
  const total = tasks.counts.done + tasks.counts.doableNow + tasks.counts.blocked;

  // The hero owns doableNow[0]; the rest of the open list follows it, so nothing
  // is repeated and nothing is lost.
  const alsoOpen = tasks.doableNow.slice(1, 4);

  return (
    <section className="lf-hub">
      <div className="lf-hub-head">
        <div className="lf-hub-headings">
          <h2 className="lf-hub-title">Where things stand</h2>
          <p className="lf-hub-live">
            <span className="lf-hub-livedot" aria-hidden />
            Kept current as you talk with your assistant
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
      <div className={`lf-next${deck.nextStep ? ` lf-next-${deck.nextStep.urgency}` : ""}`}>
        <div className="lf-next-eyebrow">
          {deck.nextStep ? "Your next step" : "Start here"}
        </div>
        <p className="lf-next-title">
          {deck.nextStep
            ? deck.nextStep.title
            : total === 0
              ? "Tell your assistant what's going on — it'll build your file from there"
              : "You're caught up. Anything you want to look at or ask about?"}
        </p>
        {deck.nextStep?.detail && <p className="lf-next-detail">{deck.nextStep.detail}</p>}

        <Link href={deck.nextStep ? askHref(deck.nextStep.ask) : chatHref} className="lf-next-cta">
          Continue with your assistant
          <ArrowIcon />
        </Link>
        <p className="lf-next-cta-sub">
          Your assistant knows every fact, date, and document on this file. It answers, explains, and
          drafts — and everything you agree on updates this page.
        </p>

        {deck.starters.length > 0 && (
          <div className="lf-next-starters">
            <span className="lf-next-starters-k">Or ask</span>
            <span className="lf-next-starters-chips">
              {deck.starters.map((s) => (
                <Link key={s.label} href={askHref(s.text)} className="lf-starter" title={s.text}>
                  {s.label}
                </Link>
              ))}
            </span>
          </div>
        )}
      </div>

      {/* ── Work already written — never make her hunt for it ───────────────── */}
      {deck.drafts.length > 0 && (
        <div className="lf-hub-drafts">
          <div className="lf-hub-bucket-head">
            Your drafts
            <span className="lf-hub-count lf-hub-count-drafts">{deck.drafts.length + deck.moreDrafts}</span>
            <a className="lf-hub-seeall" href="#documents">See all documents →</a>
          </div>
          <ul className="lf-draftlist">
            {deck.drafts.map((d) => {
              const Row = (
                <>
                  <span className="lf-draft-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                  </span>
                  <span className="lf-draft-body">
                    <span className="lf-draft-title">{d.title}</span>
                    <span className={`lf-draft-meta${d.needsInfo ? " lf-draft-meta-need" : ""}`}>{d.meta}</span>
                  </span>
                  <span className="lf-draft-open">Open<ArrowIcon /></span>
                </>
              );
              return (
                <li key={d.id}>
                  {d.href.startsWith("#") ? (
                    <a href={d.href} className="lf-draft">{Row}</a>
                  ) : (
                    <Link href={d.href} className="lf-draft">{Row}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── The rest of the open list, kept short ───────────────────────────── */}
      {alsoOpen.length > 0 && (
        <div className="lf-hub-bucket">
          <div className="lf-hub-bucket-head">
            Also on your list
            <span className="lf-hub-count lf-hub-count-now">{tasks.doableNow.length - 1}</span>
          </div>
          <ul className="lf-hub-list">
            {alsoOpen.map((t) => <Item key={t.id} t={t} />)}
          </ul>
        </div>
      )}

      {(tasks.counts.blocked > 0 || tasks.counts.done > 0) && (
        <p className="lf-hub-tally">
          {tasks.counts.blocked > 0 && (
            <span className="lf-hub-tally-wait">
              {tasks.counts.blocked} waiting on someone else
              {tasks.blocked[0]?.blockedBy?.length ? ` — ${tasks.blocked[0].blockedBy[0]}` : ""}
            </span>
          )}
          {tasks.counts.done > 0 && (
            <span className="lf-hub-tally-done">✓ {tasks.counts.done} already handled</span>
          )}
        </p>
      )}
    </section>
  );
}
