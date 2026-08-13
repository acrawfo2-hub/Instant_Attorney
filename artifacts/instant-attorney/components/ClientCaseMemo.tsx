import Link from "next/link";
import type { CaseFile } from "@/lib/types";
import type { FileDeck } from "@/lib/file-deck";
import {
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
  const primaryHref = coverActionHref(
    chatHref,
    caseFile.id,
    primaryAction,
    deck.nextStep?.ask ?? null,
  );

  const secondary = deck.actions
    .filter((action) => action.label.toLowerCase() !== (deck.nextStep?.title ?? "").toLowerCase())
    .slice(0, 2);

  return (
    <section className="lf-client-memo" aria-labelledby="client-case-memo-title">
      <div className="lf-client-memo-head">
        <p className="lf-client-memo-kicker">{caption}</p>
        <h2 id="client-case-memo-title">Here&apos;s where things stand</h2>
      </div>

      <div className="lf-client-memo-body">
        <section className="lf-client-memo-section lf-client-memo-actions">
          <h3>What you do now</h3>
          {deck.nextStep ? (
            <Link className="lf-client-memo-primary" href={primaryHref}>
              <span>{deck.nextStep.title}</span>
              {deck.nextStep.detail && <small>{deck.nextStep.detail}</small>}
            </Link>
          ) : (
            <Link className="lf-client-memo-primary" href={chatHref}>Ask what to do next</Link>
          )}
          {secondary.length > 0 && (
            <div className="lf-client-memo-secondary">
              {secondary.map((action) => (
                <Link
                  key={action.id}
                  href={coverActionHref(chatHref, caseFile.id, action)}
                >
                  {action.label} →
                </Link>
              ))}
            </div>
          )}
        </section>

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
          <h3>{catchLine.kind === "untested" ? "The catch" : catchLine.kind === "gap" ? "Still needed" : "The catch"}</h3>
          <p className={catchLine.kind === "untested" ? "lf-empty-field" : undefined}>{catchLine.text}</p>
        </section>
      </div>

      <Link href={`/dashboard/${caseFile.id}?view=living-file`} className="lf-client-memo-file">
        Open the Living File →
      </Link>
    </section>
  );
}
