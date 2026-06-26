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

/** Apply client corrections on top of signal-derived stage statuses. */
export function applyAssertionOverrides(
  stages: RoadmapStage[],
  assertions: Map<string, RoadmapAssertion>,
): RoadmapStage[] {
  if (assertions.size === 0) return stages;

  const effectivelyDone = stages.map((stage) => {
    const assertion = assertions.get(stage.key);
    if (assertion === "completed") return true;
    if (assertion === "not_yet" || assertion === "dispute") return false;
    return stage.status === "done";
  });

  const firstIncomplete = effectivelyDone.findIndex((done) => !done);

  return stages.map((stage, i) => {
    let status: RoadmapStage["status"];
    if (effectivelyDone[i]) status = "done";
    else if (firstIncomplete === -1) status = "done";
    else if (i === firstIncomplete) status = "current";
    else status = "upcoming";
    return { ...stage, status };
  });
}
