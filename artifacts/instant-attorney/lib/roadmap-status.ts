// Shared stage-status assignment for every roadmap builder.
//
// One rule, applied everywhere, so the spine behaves identically across practice
// areas: a stage is "done" when its own evidence is present OR any later stage is
// complete (a later milestone implies the earlier ones happened), "current" is the
// first stage that isn't done, and everything after it is "upcoming".
//
// The cascade-back keeps the spine monotone — a "done" check never renders AFTER
// the "you are here" marker. That clean read is what the generic and employment
// arcs already had; this generalizes it so the family, PI, bankruptcy, and matter
// arcs (which previously assigned status independently and could show a completed
// step sitting after the current one) all match.
//
// It's a map, not a deadline. Where a later step legitimately precedes an earlier
// one for a given client, they can correct it ("This isn't right"), which the
// assertion layer turns into an authoritative override.

export type StageStatus = "done" | "current" | "upcoming";

/**
 * Resolve done/current/upcoming for an ordered list of stages from their
 * per-stage completion flags. Deterministic; returns one status per flag.
 */
export function assignStageStatuses(completeFlags: boolean[]): StageStatus[] {
  const effectiveDone = new Array<boolean>(completeFlags.length);
  let laterComplete = false;
  for (let i = completeFlags.length - 1; i >= 0; i--) {
    effectiveDone[i] = completeFlags[i] || laterComplete;
    if (effectiveDone[i]) laterComplete = true;
  }

  const firstIncomplete = effectiveDone.findIndex((done) => !done);

  return effectiveDone.map((done, i) =>
    done ? "done" : i === firstIncomplete ? "current" : "upcoming",
  );
}
