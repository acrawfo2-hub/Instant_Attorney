import Link from "next/link";
import type { CaseFile } from "@/lib/types";
import type { FileDeck } from "@/lib/file-deck";
import {
  COVER_CHAT_ASK,
  coverActionHref,
  coverCaption,
  coverCatch,
  coverGoal,
  coverStanding,
  matchingAction,
} from "@/lib/cover-sheet";

interface ClientCaseMemoProps {
  caseFile: CaseFile;
  /** First real (non-placeholder) fact gap — the catch that blocks work. */
  blockingGap: string | null;
  deck: FileDeck;
  chatHref: string;
}

export default function ClientCaseMemo({
  caseFile,
  blockingGap,
  deck,
  chatHref,
}: ClientCaseMemoProps) {
  const caption = coverCaption(caseFile.matter_subtype, caseFile.jurisdiction);
  const goal = coverGoal(caseFile.goals);
  const standing = coverStanding(caseFile.summary);
  const catchLine = coverCatch(blockingGap, caseFile.legal_strategy?.risks?.[0] ?? null);
  const primaryAction = matchingAction(deck.actions, deck.nextStep?.title);
  const primaryHref = coverActionHref(chatHref, primaryAction, deck.nextStep?.ask ?? COVER_CHAT_ASK);

  const secondary = deck.actions
    .filter((action) => action.label.toLowerCase() !== (deck.nextStep?.title ?? "").toLowerCase())
    .slice(0, 2);

  return (
    <section className="lf-client-memo" aria-labelledby="client-case-memo-title">
      <div className="lf-client-memo-head">
        <p className="lf-client-memo-kicker">{caption}</p>
        <h2 id="client-case-memo-title">Here&apos;s where things stand</h2>
        <Link className="lf-client-memo-primary" href={primaryHref}>
          <span className="lf-client-memo-primary-label">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Talk with your assistant
          </span>
          <small>
            {deck.nextStep
              ? `We'll start with: ${deck.nextStep.title}`
              : "I'll pick up from this page."}
          </small>
        </Link>
        {secondary.length > 0 && (
          <div className="lf-client-memo-secondary">
            {secondary.map((action) => (
              <Link key={action.id} href={coverActionHref(chatHref, action)}>
                {action.label} →
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="lf-client-memo-body">
        <section className="lf-client-memo-section">
          <h3>What you want</h3>
          <p>{goal}</p>
        </section>

        <section className="lf-client-memo-section">
          <h3>Where things stand</h3>
          {standing ? (
            <p>{standing}</p>
          ) : (
            <p className="lf-empty-field">Your story will appear here as we talk.</p>
          )}
        </section>

        <section className="lf-client-memo-section">
          <h3>{catchLine.kind === "gap" ? "Still needed" : "The catch"}</h3>
          <p className={catchLine.kind === "untested" ? "lf-empty-field" : undefined}>{catchLine.text}</p>
        </section>
      </div>

      <Link href={`/dashboard/${caseFile.id}?view=living-file`} className="lf-client-memo-file">
        Open the Living File →
      </Link>
    </section>
  );
}
