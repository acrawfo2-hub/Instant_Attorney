import Link from "next/link";
import type { CaseFile } from "@/lib/types";
import type { MatterTasksResult, MatterTask } from "@/lib/matter-tasks";

// The consumer file's single "live" block — replaces the old stacked cards
// (recap + "what's next?" + "where things stand"). Computed server-side from the
// deterministic task view, so it renders instantly with no button and no extra
// model call. The whole point: the file is a live read of the matter, and the
// assistant is one tap away to move it forward.

const URGENCY_DOT: Record<string, string> = {
  expired: "lf-hub-dot-crit",
  critical: "lf-hub-dot-crit",
  warning: "lf-hub-dot-warn",
  normal: "lf-hub-dot-normal",
};

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
}: {
  caseFile: CaseFile;
  tasks: MatterTasksResult;
}) {
  const chatHref = `/chat?caseFileId=${caseFile.id}`;
  const total = tasks.counts.done + tasks.counts.doableNow + tasks.counts.blocked;

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
        <Link href={chatHref} className="lf-hub-cta">
          Continue with your assistant
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {caseFile.chat_session_summary && (
        <p className="lf-hub-recap">
          <span className="lf-hub-recap-k">Last time</span>
          {caseFile.chat_session_summary}
        </p>
      )}

      {total === 0 ? (
        <p className="lf-hub-empty">
          Nothing on your file yet. Tell your assistant what&apos;s going on and it&apos;ll start building your case.
        </p>
      ) : (
        <div className="lf-hub-buckets">
          {tasks.doableNow.length > 0 && (
            <div className="lf-hub-bucket">
              <div className="lf-hub-bucket-head">Do now <span className="lf-hub-count lf-hub-count-now">{tasks.doableNow.length}</span></div>
              <ul className="lf-hub-list">
                {tasks.doableNow.slice(0, 4).map((t) => <Item key={t.id} t={t} />)}
              </ul>
            </div>
          )}
          {tasks.blocked.length > 0 && (
            <div className="lf-hub-bucket">
              <div className="lf-hub-bucket-head">Waiting <span className="lf-hub-count lf-hub-count-blocked">{tasks.blocked.length}</span></div>
              <ul className="lf-hub-list">
                {tasks.blocked.slice(0, 3).map((t) => <Item key={t.id} t={t} />)}
              </ul>
            </div>
          )}
          {tasks.done.length > 0 && (
            <p className="lf-hub-done">✓ {tasks.done.length} already handled</p>
          )}
        </div>
      )}
    </section>
  );
}
