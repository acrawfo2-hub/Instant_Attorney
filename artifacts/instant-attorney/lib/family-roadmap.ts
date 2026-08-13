// ── Family Law Roadmap ───────────────────────────────────────────────────────
//
// Middle-class families are terrified of a process they've never seen. This pure
// module turns a family matter into a staged map — "here is the whole path, and
// here is where you are" — so the unknown becomes navigable. It is decoupled and
// read-only: it derives the stages and a best-effort "current stage" from the
// matter subtype, the matter text, the Living File facts, and documents on file.
// It writes nothing and changes no document and no recommendation.
//
// Path detection prefers the structured matter_subtype field (set by the AI when
// it classifies the intake) over free-text keyword scanning, so a user who says
// "I want a modification" gets the right blueprint even if their summary is thin.
//
// Per-stage completion is tracked INDEPENDENTLY from broad signals (not by
// assuming strict linear progress), so a stage is marked done only when there is
// real evidence for it — including real-world language like "we already went to
// mediation" or "the petition was filed last year". Fully unit-testable; no I/O.

import { assignStageStatuses } from "./roadmap-status.ts";

export type FamilyPath = "divorce" | "custody" | "modification" | "agreement" | "enforcement";

export type StageStatus = "done" | "current" | "upcoming";

export interface RoadmapStage {
  key: string;
  title: string;
  /** One or two plain sentences: what happens here / what to do. */
  body: string;
  status: StageStatus;
  /** Optional cost-conscious or practical tip. */
  tip?: string;
}

export interface FamilyRoadmap {
  /** Path slug — string (not FamilyPath) so non-family roadmaps can share the renderer. */
  path: string;
  pathLabel: string;
  /** True when the matter shows family-violence signals; surfaces a safety banner. */
  safety: boolean;
  safetyNote?: string;
  stages: RoadmapStage[];
  disclaimer: string;
}

export interface FamilyRoadmapInput {
  /** Matter subtype from the DB (matter_subtype column). Used as the primary path signal. */
  matterSubtype?: string | null;
  /** Matter subtype + summary, or any free text describing the matter. */
  matterText?: string | null;
  /** Confirmed-fact descriptions from the Living File. */
  facts?: string[];
  /** Documents on file (title + status). */
  documents?: { title: string; status: string }[];
}

const DISCLAIMER =
  "This roadmap is general legal information about the typical Texas process, not legal advice. Every matter is different, steps can overlap or repeat, and your court's local rules and your specific facts control. Use it as a map, not a guarantee.";

const SAFETY_NOTE =
  "Your safety comes first. If you or your children are in danger, call 911. You can seek a protective order (no filing fee to the applicant), and the National Domestic Violence Hotline is 1-800-799-7233. Tell your attorney before any adversarial filing so it doesn't escalate the danger.";

// ── Signal derivation ─────────────────────────────────────────────────────────

interface Signals {
  hasPetition: boolean;
  hasTemporaryOrders: boolean;
  hasSupport: boolean;
  hasPossession: boolean;
  hasProperty: boolean;
  hasMediation: boolean;
  hasFinalOrder: boolean;
  hasParentage: boolean;
  hasDisclosure: boolean;
  hasDraftAgreement: boolean;
  hasViolationLog: boolean;
  hasChange: boolean;
}

const DONE_DOC_STATUSES = new Set(["approved", "delivered"]);

function deriveSignals(input: FamilyRoadmapInput): Signals {
  const docs = input.documents ?? [];
  const facts = input.facts ?? [];
  const text = [input.matterSubtype ?? "", input.matterText ?? "", ...facts, ...docs.map((d) => d.title)]
    .join(" \n ")
    .toLowerCase();
  const has = (re: RegExp) => re.test(text);

  const docTitle = (re: RegExp) => docs.some((d) => re.test(d.title.toLowerCase()));
  const docDone = (re: RegExp) =>
    docs.some((d) => re.test(d.title.toLowerCase()) && DONE_DOC_STATUSES.has(d.status));

  return {
    // Catch both in-app document evidence AND real-world language ("already filed",
    // "cause number", "the petition was filed last year").
    hasPetition:
      docTitle(/petition|answer|waiver of service/) ||
      has(/already filed|petition (was|is|has been) filed|filed (the|a|my) petition|cause number|case number \d|served (with |the )?petition/),

    hasTemporaryOrders:
      has(/temporary orders|temporary restraining|interim order|\bTRO\b/) ||
      has(/already have (a )?(temp|temporary|interim) order|temp orders (are|were|have been)|had temporary orders/),

    hasSupport:
      has(/child support/) ||
      has(/support (was|is|has been) (set|established|ordered|calculated)/),

    hasPossession:
      has(/possession schedule|parenting plan|standard possession|spo\b/) ||
      has(/possession (was|is|has been) (set|ordered|agreed)|schedule (was|is|has been) agreed/),

    hasProperty:
      has(/property division|community estate|community-estate|property split/) ||
      has(/divided (the |our )?(property|estate|assets)|property (was|is|has been) divided|split (the |our )?(property|assets)/),

    hasMediation:
      has(/mediation|mediated settlement|\bmsa\b|settlement agreement/) ||
      has(/(went to|had|completed|attended|scheduled) mediation|mediation (is|was) (done|complete|scheduled|finished)/),

    hasFinalOrder:
      docDone(/final decree|final order|decree of divorce/) ||
      has(/decree signed|order signed|divorce (is|was) final|case (is|was) closed/) ||
      has(/(already )?(divorced|finalized)|finalized (the|my) divorce|divorce (was|is) final/),

    hasParentage:
      has(/paternity|parentage|acknowledgment of paternity/) ||
      has(/paternity (was|is|has been) (established|acknowledged|adjudicated)/),

    hasDisclosure:
      has(/financial disclosure|asset disclosure|disclosure of assets|inventory and appraisement/) ||
      has(/disclosed (my |our )?(assets|finances|property)|financial (disclosure|affidavit)/),

    hasDraftAgreement:
      docTitle(/premarital|prenup|marital property agreement|postnup/) ||
      has(/agreement (is|has been) drafted|drafted (the |a )?agreement/),

    hasViolationLog:
      has(/violation log|each violation|arrearage|arrears|missed (visitation|possession|payment)/) ||
      has(/documented (every|each|the) violation|list of violations|log of missed/),

    hasChange:
      has(/material (and substantial )?change|lost (my|the) job|relocat|moved away|new circumstances/) ||
      has(/job loss|income (dropped|decreased|changed)|remarried|child (started school|has special needs)/),
  };
}

// ── Path detection ────────────────────────────────────────────────────────────

// Maps the matter_subtype field (written by the AI) to a FamilyPath, using
// substring matching so minor AI phrasing variations still route correctly.
function subtypeToFamilyPath(matterSubtype: string): FamilyPath | null {
  const s = matterSubtype.toLowerCase().trim();
  if (!s) return null;
  if (/prenup|postnup|premarital|partition.and.exchange|marital.prop/.test(s)) return "agreement";
  if (/enforce|contempt|arrears|arrearage/.test(s)) return "enforcement";
  if (/modif/.test(s)) return "modification";
  if (/custody|sapcr|parentage|paternity|conservator/.test(s) && !/divorce/.test(s)) return "custody";
  if (/divorce/.test(s)) return "divorce";
  return null;
}

export function detectFamilyPath(
  matterText: string | null | undefined,
  matterSubtype?: string | null,
): FamilyPath {
  // Prefer the structured DB field — it's what the AI explicitly classified.
  if (matterSubtype) {
    const fromSubtype = subtypeToFamilyPath(matterSubtype);
    if (fromSubtype) return fromSubtype;
  }

  // Fall back to keyword scan on free text.
  const t = (matterText ?? "").toLowerCase();
  if (/prenup|postnup|premarital|marital property agreement|partition and exchange/.test(t)) return "agreement";
  if (/enforce|contempt|behind on (child )?support|denied (my )?(visitation|possession)|arrears/.test(t)) return "enforcement";
  if (/modif|change (the )?(order|custody|support)|material (and substantial )?change/.test(t)) return "modification";
  if (/custody|sapcr|paternity|parentage|conservatorship/.test(t) && !/divorce/.test(t)) return "custody";
  return "divorce"; // most common default
}

const PATH_LABELS: Record<FamilyPath, string> = {
  divorce: "Divorce",
  custody: "Custody / SAPCR",
  modification: "Modifying an existing order",
  agreement: "Marital agreement",
  enforcement: "Enforcing an order",
};

// ── Stage blueprints ──────────────────────────────────────────────────────────
// Each stage carries a predicate over the signals that marks it complete.

interface StageBlueprint {
  key: string;
  title: string;
  body: string;
  tip?: string;
  complete: (s: Signals) => boolean;
}

function divorceStages(hasKids: boolean): StageBlueprint[] {
  const stages: StageBlueprint[] = [
    {
      key: "decide",
      title: "Decide your path",
      body: "Get clear on whether this is agreed (uncontested) or contested, and confirm everyone is safe. An agreed divorce is far faster and cheaper.",
      tip: "Most middle-class divorces that stay out of court cost a fraction of a litigated one.",
      complete: (s) => s.hasPetition || s.hasFinalOrder,
    },
    {
      key: "file",
      title: "File the petition (or respond)",
      body: "One spouse files the Original Petition for Divorce; the other is served and files an answer or signs a waiver. This starts the case and the clock.",
      complete: (s) => s.hasPetition || s.hasFinalOrder,
    },
    {
      key: "temporary",
      title: "Temporary orders (if needed)",
      body: "If you need interim rules while the case is pending — who lives where, temporary support, a temporary schedule for the kids — the court can set them early.",
      complete: (s) => s.hasTemporaryOrders,
    },
  ];
  if (hasKids) {
    stages.push({
      key: "children",
      title: "Parenting plan & child support",
      body: "Settle the possession schedule (often the Standard Possession Order) and child support. Use the estimators to see real numbers before you negotiate.",
      tip: "The Office of the Attorney General can help establish or collect child support at no cost.",
      complete: (s) => s.hasPossession || s.hasSupport,
    });
  }
  stages.push(
    {
      key: "property",
      title: "Divide property & debts",
      body: "Characterize what's community vs. separate and agree a just-and-right division of the marital estate. The property estimator gives you a starting picture.",
      complete: (s) => s.hasProperty,
    },
    {
      key: "mediation",
      title: "Mediation / settlement",
      body: "Most cases settle. A mediator helps you reach a written agreement (an MSA) that becomes binding — usually far cheaper than a trial.",
      tip: "A mediated settlement avoids the cost and uncertainty of letting a judge decide.",
      complete: (s) => s.hasMediation,
    },
    {
      key: "final",
      title: "Final decree",
      body: "After the 60-day waiting period, the agreed terms go into a Final Decree of Divorce for the judge to sign. That signature ends the marriage.",
      complete: (s) => s.hasFinalOrder,
    }
  );
  return stages;
}

function custodyStages(): StageBlueprint[] {
  return [
    {
      key: "decide",
      title: "Decide your path & safety check",
      body: "Confirm what you're asking for — conservatorship, a possession schedule, support — and that everyone is safe.",
      complete: (s) => s.hasPetition || s.hasFinalOrder,
    },
    {
      key: "parentage",
      title: "Establish parentage (if unmarried)",
      body: "For unmarried parents, legal parentage must be established first — by acknowledgment or court order — before custody and support can be set.",
      complete: (s) => s.hasParentage || s.hasPetition || s.hasFinalOrder,
    },
    {
      key: "file",
      title: "File the SAPCR (or respond)",
      body: "File the Suit Affecting the Parent-Child Relationship in the child's home county; the other parent is served or waives service.",
      complete: (s) => s.hasPetition || s.hasFinalOrder,
    },
    {
      key: "temporary",
      title: "Temporary orders (if needed)",
      body: "The court can set an interim schedule and temporary support while the case is pending.",
      complete: (s) => s.hasTemporaryOrders,
    },
    {
      key: "plan",
      title: "Parenting plan & support",
      body: "Settle the possession schedule and child support — the estimators show the Standard Possession Order and guideline support.",
      tip: "The Office of the Attorney General can help with support at no cost.",
      complete: (s) => s.hasPossession || s.hasSupport,
    },
    {
      key: "mediation",
      title: "Mediation / agreement",
      body: "Agreeing a child-centered plan in mediation is usually faster, cheaper, and less stressful for the kids than a custody trial.",
      complete: (s) => s.hasMediation,
    },
    {
      key: "final",
      title: "Final order",
      body: "The agreed terms go into a final order for the judge to sign.",
      complete: (s) => s.hasFinalOrder,
    },
  ];
}

function modificationStages(): StageBlueprint[] {
  return [
    {
      key: "change",
      title: "Confirm a material & substantial change",
      body: "A court will only change an existing order if circumstances have materially and substantially changed since it was entered (a move, job loss, the child's needs).",
      complete: (s) => s.hasChange || s.hasPetition || s.hasFinalOrder,
    },
    {
      key: "file",
      title: "File the motion to modify",
      body: "File in the court that has continuing jurisdiction over the existing order; the other party is served or waives service.",
      complete: (s) => s.hasPetition || s.hasFinalOrder,
    },
    {
      key: "temporary",
      title: "Temporary orders (if needed)",
      body: "If the change can't wait, the court can adjust the schedule or support on a temporary basis while the motion is pending.",
      complete: (s) => s.hasTemporaryOrders,
    },
    {
      key: "negotiate",
      title: "Negotiate / mediate the change",
      body: "Most modifications resolve by agreement. Use the estimators to ground the new support or schedule in real numbers.",
      complete: (s) => s.hasMediation || s.hasSupport || s.hasPossession,
    },
    {
      key: "final",
      title: "Final modified order",
      body: "The agreed (or ordered) change goes into a modified order for the judge to sign.",
      complete: (s) => s.hasFinalOrder,
    },
  ];
}

function agreementStages(): StageBlueprint[] {
  return [
    {
      key: "decide",
      title: "Decide what to protect & disclose finances",
      body: "Identify each person's separate property and goals, then prepare a fair, reasonable disclosure of each party's assets and debts — full disclosure is what makes the agreement hold up.",
      tip: "Hidden assets or no disclosure is the most common reason these agreements get thrown out.",
      complete: (s) => s.hasDisclosure || s.hasDraftAgreement,
    },
    {
      key: "draft",
      title: "Draft the agreement",
      body: "Draft the premarital (before marriage) or marital/partition (already married) agreement, defining how property and income are characterized.",
      complete: (s) => s.hasDraftAgreement,
    },
    {
      key: "review",
      title: "Independent review",
      body: "Each party should have the chance to review with their own counsel, unhurried. Signing voluntarily and knowingly is essential to enforceability.",
      complete: () => false,
    },
    {
      key: "sign",
      title: "Sign and execute",
      body: "Sign and properly execute the agreement — a premarital agreement before the wedding (effective on marriage); a marital agreement during the marriage.",
      complete: () => false,
    },
  ];
}

function enforcementStages(): StageBlueprint[] {
  return [
    {
      key: "document",
      title: "Document each violation",
      body: "Write down every missed payment or denied possession period with its exact date and amount. Specific, dated violations are what a court can act on.",
      complete: (s) => s.hasViolationLog || s.hasPetition,
    },
    {
      key: "file",
      title: "File the motion to enforce",
      body: "File in the court with continuing jurisdiction, listing each violation. For child support, the Office of the Attorney General can also enforce at no cost.",
      complete: (s) => s.hasPetition || s.hasFinalOrder,
    },
    {
      key: "hearing",
      title: "Hearing — judgment, contempt, fees",
      body: "At the hearing the court can render judgment for back support, hold the other party in contempt, and award your attorney's fees.",
      complete: (s) => s.hasFinalOrder,
    },
  ];
}

function blueprintsFor(path: FamilyPath, input: FamilyRoadmapInput): StageBlueprint[] {
  const t = [input.matterSubtype ?? "", input.matterText ?? "", ...(input.facts ?? [])].join(" ").toLowerCase();
  switch (path) {
    case "divorce": {
      // Guard against negation ("no children") before the keyword check.
      const noKids = /\bno (children|kids|minor children)\b|without (children|kids)|childless/.test(t);
      const hasKids = !noKids && /child|kid|custody|son|daughter|conservator|parenting/.test(t);
      return divorceStages(hasKids);
    }
    case "custody":
      return custodyStages();
    case "modification":
      return modificationStages();
    case "agreement":
      return agreementStages();
    case "enforcement":
      return enforcementStages();
  }
}

/**
 * Build a staged Family Law Roadmap with a best-effort "current" stage.
 * Deterministic and side-effect free.
 *
 * Pass `matterSubtype` (from the DB) to prefer the structured field over
 * free-text keyword scanning for path detection.
 */
export function buildFamilyRoadmap(input: FamilyRoadmapInput): FamilyRoadmap {
  const path = detectFamilyPath(input.matterText, input.matterSubtype);
  const signals = deriveSignals(input);
  const blueprints = blueprintsFor(path, input);
  const statuses = assignStageStatuses(blueprints.map((b) => b.complete(signals)));

  const stages: RoadmapStage[] = blueprints.map((b, i) => ({
    key: b.key,
    title: b.title,
    body: b.body,
    status: statuses[i],
    ...(b.tip ? { tip: b.tip } : {}),
  }));

  const safetyText = [
    input.matterSubtype ?? "",
    input.matterText ?? "",
    ...(input.facts ?? []),
  ].join(" ").toLowerCase();
  const safety = /family violence|domestic violence|abuse|protective order|afraid|unsafe|threatened/.test(safetyText);

  return {
    path,
    pathLabel: PATH_LABELS[path],
    safety,
    ...(safety ? { safetyNote: SAFETY_NOTE } : {}),
    stages,
    disclaimer: DISCLAIMER,
  };
}
