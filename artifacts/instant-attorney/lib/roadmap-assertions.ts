// Client roadmap corrections — map stage assertions to Living File facts and
// post-process deterministic stage status. Assertions are stored as confirmed
// facts with a `Roadmap · {stageKey}:` prefix so they are auditable and
// fingerprint the file for AI refresh.
//
// A correction records ONLY what the client actually told us: the assertion type
// plus any free-text note they typed. It never fabricates specific facts — dates,
// cause numbers, "the petition was filed", "reported to HR in writing", etc. — on
// the client's behalf. Putting words in a client's mouth in a privileged file is
// not acceptable, and it isn't needed: applyAssertionOverrides moves the "you are
// here" marker from the assertion type alone, so no invented detail is required.

import type { RoadmapStage } from "./roadmap-types.ts";

export type RoadmapAssertion = "completed" | "not_yet" | "dispute";

const PREFIX_RE = /^Roadmap · ([^:]+):\s*(.+)$/i;

export function assertionFactPrefix(stageKey: string): string {
  return `Roadmap · ${stageKey}:`;
}

export function buildAssertionDescription(
  stageKey: string,
  assertion: RoadmapAssertion,
  note?: string,
): string {
  const prefix = assertionFactPrefix(stageKey);
  let body: string;
  switch (assertion) {
    case "completed":
      body = "Client confirmed this step is complete.";
      break;
    case "not_yet":
      body = "Client indicated they have not reached this step yet.";
      break;
    case "dispute":
      body = "Client indicated the roadmap is not accurate here.";
      break;
  }
  const trimmed = note?.trim();
  if (trimmed) body += ` Note: ${trimmed}`;
  return `${prefix} ${body}`;
}

export function parseAssertionType(body: string): RoadmapAssertion | null {
  const lower = body.toLowerCase();
  if (/confirmed this step is complete|confirmed complete/.test(lower)) return "completed";
  if (/not reached this step|not yet|have not reached/.test(lower)) return "not_yet";
  if (/not accurate|disputed/.test(lower)) return "dispute";
  return null;
}

/** Latest assertion per stage from confirmed fact descriptions. */
export function parseRoadmapAssertions(factDescriptions: string[]): Map<string, RoadmapAssertion> {
  const out = new Map<string, RoadmapAssertion>();
  for (const desc of factDescriptions) {
    const m = desc.match(PREFIX_RE);
    if (!m) continue;
    const stageKey = m[1].trim();
    const type = parseAssertionType(m[2]);
    if (type) out.set(stageKey, type);
  }
  return out;
}

/**
 * Apply client corrections on top of signal-derived stage statuses.
 *
 * Two client signals bound the result:
 *  - "not yet" / "this isn't right" sets a **cap**: the earliest stage the client
 *    says they haven't reached. Nothing at or past it stays "done" — their
 *    "I'm actually back here" overrides any inferred progress, and "you are here"
 *    snaps back to it.
 *  - "I've already done this" sets a **floor**: the furthest stage the client says
 *    they've completed. Every stage up to it is marked done, so confirming an
 *    out-of-order step advances "you are here" past it instead of stranding it
 *    behind a checked-off step.
 *
 * If the two contradict (a completion claimed past a not-reached stage), the cap
 * wins — the conservative "you are here" — so a "done" check never lands after the
 * current marker.
 */
export function applyAssertionOverrides(
  stages: RoadmapStage[],
  assertions: Map<string, RoadmapAssertion>,
): RoadmapStage[] {
  if (assertions.size === 0) return stages;

  let cap = stages.length;
  let floor = -1;
  stages.forEach((stage, i) => {
    const a = assertions.get(stage.key);
    if ((a === "not_yet" || a === "dispute") && i < cap) cap = i;
    if (a === "completed" && i > floor) floor = i;
  });

  const effectivelyDone = stages.map((stage, i) => {
    if (i >= cap) return false; // not reached yet
    if (i <= floor) return true; // client confirmed progress at least to here
    return stage.status === "done"; // otherwise trust the signal-derived status
  });

  const firstIncomplete = effectivelyDone.findIndex((done) => !done);

  return stages.map((stage, i) => ({
    ...stage,
    status: effectivelyDone[i]
      ? "done"
      : i === firstIncomplete
        ? "current"
        : "upcoming",
  }));
}
