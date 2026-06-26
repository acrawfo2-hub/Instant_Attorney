// ── Employment claim roadmap ─────────────────────────────────────────────────
//
// "All the complicated steps" of a discrimination/retaliation claim, laid out as
// a calm map with a best-effort "you are here." The process trips people up
// because it's multi-stage and deadline-gated (internal complaint → agency charge
// → investigation → right-to-sue → lawsuit). Pure and read-only; per-stage
// completion is evidence-based, and prerequisite stages complete once a later one
// is reached (the process is sequential). Mirrors lib/bankruptcy-roadmap.ts.

import { assignStageStatuses } from "./roadmap-status.ts";

export type StageStatus = "done" | "current" | "upcoming";

export interface EmploymentStage {
  key: string;
  title: string;
  body: string;
  status: StageStatus;
  tip?: string;
}

export interface EmploymentRoadmap {
  stages: EmploymentStage[];
  disclaimer: string;
}

export interface EmploymentRoadmapInput {
  matterText?: string | null;
  facts?: string[];
  documents?: { title: string; status: string }[];
}

const DISCLAIMER =
  "This maps the typical path of a Texas/federal discrimination or retaliation claim for general information, not legal advice. Not every matter follows every step, the deadlines are short, and your facts and forum control. An EEOC charge is generally required before a discrimination lawsuit.";

const DONE_DOC_STATUSES = new Set(["approved", "delivered"]);

interface Signals {
  assessed: boolean;
  charged: boolean;
  rightToSue: boolean;
  sued: boolean;
}

function deriveSignals(input: EmploymentRoadmapInput): Signals {
  const docs = input.documents ?? [];
  const facts = input.facts ?? [];
  const text = [input.matterText ?? "", ...facts, ...docs.map((d) => d.title)].join(" \n ").toLowerCase();
  const has = (re: RegExp) => re.test(text);
  const docDone = (re: RegExp) => docs.some((d) => re.test(d.title.toLowerCase()) && DONE_DOC_STATUSES.has(d.status));

  return {
    assessed: has(/employment claim assessment|non-compete enforceability|charge of discrimination/),
    charged: docDone(/charge of discrimination|eeoc charge/) || has(/charge filed|filed with the eeoc|filed with the twc/),
    rightToSue: has(/right.to.sue|notice of right to sue|dismissal and notice/),
    sued: docDone(/petition|complaint/) || has(/lawsuit filed|suit filed|filed in court/),
  };
}

interface Blueprint {
  key: string;
  title: string;
  body: string;
  tip?: string;
  complete: (s: Signals) => boolean;
}

const STAGES: Blueprint[] = [
  {
    key: "document",
    title: "Document & preserve everything",
    body: "Before anything else, save the evidence — emails, texts, reviews, your handbook, pay records — and write a dated timeline while it's fresh. Cases are won on contemporaneous proof.",
    tip: "Use a personal device/email; don't rely on access you could lose if you're let go.",
    complete: (s) => s.assessed || s.charged || s.rightToSue || s.sued,
  },
  {
    key: "internal",
    title: "Report internally (and protect your rights)",
    body: "Where appropriate, use the employer's HR/complaint process in writing — it creates a record and can itself be protected activity. Request any accommodation in writing too.",
    tip: "Getting punished AFTER a complaint often becomes the strongest claim — retaliation.",
    complete: (s) => s.charged || s.rightToSue || s.sued,
  },
  {
    key: "assess",
    title: "Identify the claim — and the deadline",
    body: "Figure out what kind of claim you have, where it's filed (EEOC, TWC, DOL, NLRB, or court), and the deadline. This is the make-or-break step: the windows are short.",
    complete: (s) => s.assessed || s.charged || s.rightToSue || s.sued,
  },
  {
    key: "charge",
    title: "File the agency charge (EEOC / TWC)",
    body: "For discrimination or retaliation, file a charge with the EEOC (300 days in Texas) and/or the Texas Workforce Commission (180 days) — the required step before you can sue.",
    tip: "Filing with one can dual-file with the other; don't let the shorter clock catch you.",
    complete: (s) => s.charged || s.rightToSue || s.sued,
  },
  {
    key: "investigation",
    title: "Investigation & mediation",
    body: "The agency notifies the employer, may offer mediation, and investigates — often requesting a position statement from the employer that you can respond to. Many cases resolve here.",
    complete: (s) => s.rightToSue || s.sued,
  },
  {
    key: "right_to_sue",
    title: "Right-to-sue notice",
    body: "The agency issues a 'right to sue' notice (or you request one after the waiting period). This starts a strict 90-day clock to file your lawsuit.",
    tip: "Ninety days is firm — calendar it the day the notice arrives.",
    complete: (s) => s.sued,
  },
  {
    key: "lawsuit",
    title: "File the lawsuit",
    body: "If unresolved, file suit within 90 days of the right-to-sue notice. From here the case proceeds through discovery toward settlement or trial.",
    complete: (s) => s.sued,
  },
];

/**
 * Build the employment claim roadmap with a best-effort "current" stage. Deterministic.
 */
export function buildEmploymentRoadmap(input: EmploymentRoadmapInput): EmploymentRoadmap {
  const signals = deriveSignals(input);
  const statuses = assignStageStatuses(STAGES.map((b) => b.complete(signals)));

  const stages: EmploymentStage[] = STAGES.map((b, i) => ({
    key: b.key,
    title: b.title,
    body: b.body,
    status: statuses[i],
    ...(b.tip ? { tip: b.tip } : {}),
  }));

  return { stages, disclaimer: DISCLAIMER };
}
