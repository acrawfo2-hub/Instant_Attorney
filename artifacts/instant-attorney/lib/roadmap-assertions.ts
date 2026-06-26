// Client roadmap corrections — map stage assertions to Living File facts and
// post-process deterministic stage status. Assertions are stored as confirmed
// facts with a `Roadmap · {stageKey}:` prefix so they are auditable and
// fingerprint the file for AI refresh.

import type { RoadmapStage } from "./roadmap-types";

export type RoadmapAssertion = "completed" | "not_yet" | "dispute";

const PREFIX_RE = /^Roadmap · ([^:]+):\s*(.+)$/i;

/** Phrases chosen to match existing roadmap signal regexes in each builder. */
const STAGE_PHRASES: Record<string, Record<string, string>> = {
  "family-divorce": {
    decide: "Petition was filed to start the case.",
    file: "Petition was filed last year and we have a cause number.",
    temporary: "Temporary orders were set by the court.",
    children: "Possession was set and child support was established.",
    property: "Property was divided in the marital estate.",
    mediation: "We completed mediation and reached a mediated settlement.",
    final: "The divorce was final and the decree was signed.",
  },
  "family-custody": {
    decide: "Petition was filed to start the case.",
    parentage: "Paternity was established by court order.",
    file: "SAPCR petition was filed and we have a cause number.",
    temporary: "Temporary orders were set by the court.",
    plan: "Possession schedule was agreed and child support was established.",
    mediation: "We completed mediation on the parenting plan.",
    final: "The final order was signed by the judge.",
  },
  "family-modification": {
    change: "There is a material and substantial change in circumstances.",
    file: "Motion to modify was filed and we have a cause number.",
    temporary: "Temporary orders were adjusted while the motion is pending.",
    negotiate: "We completed mediation on the modification.",
    final: "The modified order was signed by the judge.",
  },
  "family-agreement": {
    decide: "Financial disclosure of assets and debts was completed.",
    draft: "The marital property agreement has been drafted.",
    review: "Each party reviewed the agreement with independent counsel.",
    sign: "The agreement was signed and executed.",
  },
  "family-enforcement": {
    document: "I documented each violation with exact dates and amounts.",
    file: "Motion to enforce was filed and we have a cause number.",
    hearing: "The enforcement hearing concluded and the case was closed.",
  },
  bankruptcy: {
    counseling: "Credit counseling is complete and petition filed.",
    picture: "Means test and disposable income were run; exemptions show what we'd likely keep.",
    choose: "We chose Chapter 7 and petition was filed.",
    file: "Bankruptcy petition filed and automatic stay is in effect.",
    meeting: "341 meeting completed and discharge granted.",
    education: "Debtor education course completed before discharge.",
    discharge: "Discharge was granted and qualifying debts were wiped out.",
  },
  employment: {
    document: "Employment claim assessment completed with evidence preserved.",
    internal: "Reported the issue to HR in writing.",
    assess: "Employment claim assessment identified the claim and deadline.",
    charge: "Charge filed with the EEOC.",
    investigation: "Agency investigation completed with notice of right to sue.",
    right_to_sue: "Right-to-sue notice received from the agency.",
    lawsuit: "Lawsuit filed in court.",
  },
  "personal-injury": {
    treatment: "I was treated at the hospital emergency room after the injury.",
    document: "Police report obtained and photos of the scene and injuries taken.",
    preserve: "Preservation letter sent to preserve evidence.",
    insurance: "Insurance adjuster contacted and claim number assigned.",
    damages: "Medical bills gathered and settlement demand prepared.",
    demand: "Settlement demand letter sent to the insurer.",
    resolve: "Retained attorney for the injury claim.",
    records: "Complete medical records obtained from all providers.",
    timeline: "Medical timeline built and retained attorney.",
    expert: "Retained counsel for malpractice expert review.",
    standing: "Beneficiaries identified and retained attorney.",
    proof: "Police report and preservation letter obtained.",
  },
  generic: {
    understand: "Case summary documents the situation and goals.",
    build_file: "Confirmed facts gathered; open gaps and uploads are complete.",
    documents: "Document draft prepared from the file.",
    review: "Document submitted for attorney review.",
    resolution: "Final document approved and delivered.",
  },
  "matter-debt": {
    document: "Documented the problem with a timeline and records.",
    rights: "Formal demand letter sent to the other party.",
    demand: "Formal demand letter sent with a clear deadline.",
    negotiate: "Completed mediation on the debt dispute.",
    escalate: "Case filed in court with a cause number.",
  },
  "matter-hoa": {
    govdocs: "HOA CC&Rs and governing documents reviewed.",
    document: "Documented every violation notice and board decision.",
    board: "Formal written request sent to the HOA board.",
    adr: "Completed mediation on the HOA dispute.",
    legal: "Case filed in court regarding the HOA dispute.",
  },
  "matter-employment": {
    document: "Documented every incident and saved contemporaneous evidence.",
    internal: "Filed a written complaint with HR.",
    agency: "Charge filed with the EEOC.",
    negotiate: "Formal demand letter sent after the agency charge.",
    resolve: "Case filed in court or matter resolved.",
  },
  "matter-estate": {
    inventory: "Estate assets inventoried and beneficiaries identified.",
    draft: "Will and power of attorney documents drafted.",
    trust: "Living trust funded with assets transferred in.",
    execute: "Will signed and executed with proper witnesses.",
    review: "Estate plan reviewed after a life change.",
  },
  "matter-general": {
    understand: "Documented the parties, timeline, and key events.",
    strategy: "Legal strategy identified with deadlines noted.",
    file: "Core documents drafted from the file.",
    action: "Formal demand letter sent to the other party.",
    resolve: "Matter settled or case filed in court.",
  },
};

export function completionPhrase(blueprintKey: string, stageKey: string): string {
  const map = STAGE_PHRASES[blueprintKey];
  if (map?.[stageKey]) return map[stageKey];
  for (const phrases of Object.values(STAGE_PHRASES)) {
    if (phrases[stageKey]) return phrases[stageKey];
  }
  return `Client completed the ${stageKey.replace(/_/g, " ")} step.`;
}

export function assertionFactPrefix(stageKey: string): string {
  return `Roadmap · ${stageKey}:`;
}

export function buildAssertionDescription(
  stageKey: string,
  assertion: RoadmapAssertion,
  blueprintKey: string,
  note?: string,
): string {
  const prefix = assertionFactPrefix(stageKey);
  let body: string;
  switch (assertion) {
    case "completed":
      body = `Client confirmed this step is complete. ${completionPhrase(blueprintKey, stageKey)}`;
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
