"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeckAction, FileDeck } from "@/lib/file-deck";

// "Where we stand", pinned above the transcript.
//
// Clients like the standing read and then lose it: the assistant answers at
// length, and one long turn buries it above the scroll. A status you have to go
// hunting for is not a status. So it lives outside the scroll container, and it
// re-reads itself after every turn.
//
// Each row carries the way to finish it here — open the document, attach the
// file, or ask the assistant — because a list you can read but not act on has
// only moved the work somewhere else.

const CollapseIcon = ({ open }: { open: boolean }) => (
  <svg
    width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden
    style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

function ActionRow({
  action,
  onAsk,
  onOpenDraft,
  onAttach,
}: {
  action: DeckAction;
  onAsk: (text: string) => void;
  onOpenDraft: (draftId: string) => void;
  onAttach: () => void;
}) {
  const verb =
    action.blocked ? "Why is this waiting?"
    : action.kind === "draft" ? "Open document"
    : action.kind === "upload" ? "Attach it"
    : "Do this";

  const run = () => {
    if (action.blocked) return onAsk(`Why is “${action.label}” still waiting, and can I do anything to move it?`);
    if (action.kind === "draft" && action.draftId) return onOpenDraft(action.draftId);
    if (action.kind === "upload") return onAttach();
    return onAsk(action.ask);
  };

  return (
    <li className={`csr-item${action.blocked ? " csr-item-blocked" : ""}`}>
      <span className={`csr-dot csr-dot-${action.urgency}`} aria-hidden />
      <span className="csr-item-label">{action.label}</span>
      <button type="button" className="csr-item-btn" onClick={run}>
        {verb}
      </button>
    </li>
  );
}

export default function ChatStandingRail({
  caseFileId,
  refreshKey,
  onAsk,
  onOpenDraft,
  onAttach,
}: {
  caseFileId: string;
  /** Bump after a turn finishes so the standing read reflects it. */
  refreshKey: number;
  onAsk: (text: string) => void;
  onOpenDraft: (draftId: string) => void;
  onAttach: () => void;
}) {
  const [deck, setDeck] = useState<FileDeck | null>(null);
  const [recap, setRecap] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/case-files/${caseFileId}/deck`);
      if (!res.ok) return;
      const data = await res.json();
      setDeck(data.deck ?? null);
      setRecap(data.recap ?? null);
    } catch {
      // A stale rail is better than a broken chat — keep whatever we last had.
    }
  }, [caseFileId]);

  // Reload after each turn — and once more shortly after. The route persists
  // facts, drafts, and file updates as the turn closes, so a read taken the
  // instant the reply lands can miss the very change the reply describes.
  useEffect(() => {
    load();
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  // Nothing to stand on yet (a brand-new file): stay out of the way entirely.
  if (!deck || (!deck.nextStep && deck.actions.length === 0 && deck.drafts.length === 0)) return null;

  const headline = deck.pressing
    ? `${deck.pressing.label} — ${deck.pressing.countdown}`
    : deck.nextStep?.title ?? "You're caught up on this matter";

  const openCount = deck.actions.filter((a) => !a.blocked).length;

  return (
    <section className={`csr${deck.pressing ? " csr-pressing" : ""}`} aria-label="Where we stand">
      <button
        type="button"
        className="csr-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="csr-head-k">Where we stand</span>
        <span className="csr-head-line">{headline}</span>
        {openCount > 0 && <span className="csr-head-count">{openCount}</span>}
        <CollapseIcon open={open} />
      </button>

      {open && (
        <div className="csr-body">
          {recap && (
            <p className="csr-recap">
              <span className="csr-recap-k">Last time</span>
              {recap}
            </p>
          )}

          {deck.actions.length > 0 && (
            <>
              <div className="csr-section-k">What&apos;s left to do</div>
              <ul className="csr-list">
                {deck.actions.map((a) => (
                  <ActionRow
                    key={a.id}
                    action={a}
                    onAsk={onAsk}
                    onOpenDraft={onOpenDraft}
                    onAttach={onAttach}
                  />
                ))}
              </ul>
            </>
          )}

          {deck.drafts.length > 0 && (
            <>
              <div className="csr-section-k">Your documents</div>
              <ul className="csr-list">
                {deck.drafts.map((d) => {
                  const draftId = d.href.includes("draft=") ? d.href.split("draft=")[1] : null;
                  return (
                    <li key={d.id} className="csr-item">
                      <span className="csr-dot csr-dot-normal" aria-hidden />
                      <span className="csr-item-label">
                        {d.title}
                        <span className={`csr-item-meta${d.needsInfo ? " csr-item-meta-need" : ""}`}>{d.meta}</span>
                      </span>
                      {draftId ? (
                        <button type="button" className="csr-item-btn" onClick={() => onOpenDraft(draftId)}>
                          Open
                        </button>
                      ) : (
                        // Promoted documents live on the case file, not in the
                        // side panel — send her where the document actually is.
                        <a className="csr-item-btn" href={`/dashboard/${caseFileId}#documents`}>
                          View on file
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
