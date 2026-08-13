import Link from "next/link";
import type { CaseFile, FactItem } from "@/lib/types";
import type { FileDeck } from "@/lib/file-deck";

interface ClientCaseMemoProps {
  caseFile: CaseFile;
  confirmedFacts: FactItem[];
  deck: FileDeck;
  chatHref: string;
}

function sentences(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return (value.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function actionHref(chatHref: string, ask: string): string {
  const separator = chatHref.includes("?") ? "&" : "?";
  // Chat reads `ask=` (and deliberately does not auto-send). `prompt=` was a
  // leftover name the composer never looked at, so the cover-sheet buttons
  // opened a blank box.
  return `${chatHref}${separator}ask=${encodeURIComponent(ask)}`;
}

export default function ClientCaseMemo({ caseFile, confirmedFacts, deck, chatHref }: ClientCaseMemoProps) {
  const strategy = caseFile.legal_strategy;
  const check = strategy?.strength_check;
  const standing = unique([
    ...sentences(caseFile.summary),
    ...sentences(strategy?.summary),
    ...sentences(check?.headline),
  ]).slice(0, 5);
  const importantFacts = unique(confirmedFacts.map((fact) => fact.description)).slice(0, 4);
  const adverse = unique([
    ...(check?.weakest ?? []),
    ...(check?.counterarguments ?? []).map((item) => item.attack),
    ...(strategy?.risks ?? []),
  ]).slice(0, 3);
  const secondaryActions = deck.actions
    .filter((action) => action.label.toLowerCase() !== deck.nextStep?.title.toLowerCase())
    .slice(0, 2);

  return (
    <section className="lf-client-memo" aria-labelledby="client-case-memo-title">
      <div className="lf-client-memo-head">
        <p className="lf-client-memo-kicker">Client memo</p>
        <h2 id="client-case-memo-title">Your case at a glance</h2>
      </div>

      <div className="lf-client-memo-grid">
        <section className="lf-client-memo-section">
          <h3>Where you stand</h3>
          {standing.length > 0 ? (
            <p>{standing.join(" ")}</p>
          ) : (
            <p className="lf-empty-field">Your case summary will appear as your intake is organized.</p>
          )}
          {/* The memo shows the first few sentences; the matter, goals, and the
              full strategy live behind this link. It is the only way into the
              case-details view now that the tile map no longer names it. */}
          <Link href={`/dashboard/${caseFile.id}?view=case-details`} className="lf-client-memo-link">
            See full summary, goals &amp; strategy →
          </Link>
        </section>

        <section className="lf-client-memo-section">
          <h3>Important facts</h3>
          {importantFacts.length > 0 ? (
            <ul>{importantFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
          ) : (
            <p className="lf-empty-field">No facts have been confirmed yet.</p>
          )}
          <Link href={`/dashboard/${caseFile.id}?view=facts`} className="lf-client-memo-link">See all facts →</Link>
        </section>

        <section className="lf-client-memo-section">
          <h3>What may work against you</h3>
          {adverse.length > 0 ? (
            <ul>{adverse.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          ) : (
            <p className="lf-empty-field">No adverse points are stored yet. This will update as the file develops.</p>
          )}
          <Link href={`/dashboard/${caseFile.id}?view=strength`} className="lf-client-memo-link">Open full strength check →</Link>
        </section>

        <section className="lf-client-memo-section lf-client-memo-actions">
          <h3>What happens next</h3>
          {deck.nextStep ? (
            <Link className="lf-client-memo-primary" href={actionHref(chatHref, deck.nextStep.ask)}>
              <span>{deck.nextStep.title}</span>
              {deck.nextStep.detail && <small>{deck.nextStep.detail}</small>}
            </Link>
          ) : (
            <Link className="lf-client-memo-primary" href={chatHref}>Ask what to do next</Link>
          )}
          {secondaryActions.length > 0 && (
            <div className="lf-client-memo-secondary">
              {secondaryActions.map((action) => (
                <Link key={action.id} href={actionHref(chatHref, action.ask)}>{action.label} →</Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
