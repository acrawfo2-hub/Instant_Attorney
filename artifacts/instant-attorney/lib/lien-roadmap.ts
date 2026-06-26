// ── Property Lien Roadmap ────────────────────────────────────────────────────
//
// Staged map for Texas property-lien matters — mechanic's liens, mortgage
// foreclosure, judgment liens, tax liens, and title encumbrances. Mirrors
// lib/pi-roadmap.ts. Deterministic and side-effect free.

import { assignStageStatuses } from "./roadmap-status.ts";

export type LienPath =
  | "mechanics_lien"
  | "mortgage_foreclosure"
  | "judgment_lien"
  | "tax_lien"
  | "title_encumbrance"
  | "general";

export type StageStatus = "done" | "current" | "upcoming";

export interface RoadmapStage {
  key: string;
  title: string;
  body: string;
  status: StageStatus;
  tip?: string;
}

export interface LienRoadmap {
  path: LienPath;
  pathLabel: string;
  urgent: boolean;
  urgentNote?: string;
  stages: RoadmapStage[];
  disclaimer: string;
}

export interface LienRoadmapInput {
  matterText?: string | null;
  facts?: string[];
  documents?: { title: string; status: string }[];
}

const DISCLAIMER =
  "This roadmap is general legal information about how Texas property liens and foreclosure typically work, not legal advice. Sale dates, notice defects, and homestead status depend on your specific documents. Use it as a map, not a guarantee.";

const URGENT_NOTE =
  "A scheduled foreclosure or tax sale can cost you your property in weeks. Texas non-judicial foreclosures happen on the first Tuesday of the month after notice — do not wait to get payoff figures and understand your deadline.";

interface Signals {
  hasTitleCommitment: boolean;
  hasLienDocument: boolean;
  hasPayoffRequest: boolean;
  hasResponseFiled: boolean;
  hasPaymentTendered: boolean;
  hasSaleScheduled: boolean;
  hasResolved: boolean;
}

const DONE_DOC_STATUSES = new Set(["approved", "delivered"]);

function deriveSignals(input: LienRoadmapInput): Signals {
  const docs = input.documents ?? [];
  const facts = input.facts ?? [];
  const text = [input.matterText ?? "", ...facts, ...docs.map((d) => d.title)].join(" \n ").toLowerCase();
  const has = (re: RegExp) => re.test(text);
  const docTitle = (re: RegExp) => docs.some((d) => re.test(d.title.toLowerCase()));
  const docDone = (re: RegExp) =>
    docs.some((d) => re.test(d.title.toLowerCase()) && DONE_DOC_STATUSES.has(d.status));

  return {
    hasTitleCommitment:
      has(/title commitment|schedule b|title policy|title search/) ||
      docTitle(/title commitment|title report/),
    hasLienDocument:
      has(/lien affidavit|notice of lien|notice of sale|abstract of judgment|deed of trust/) ||
      docTitle(/lien|foreclosure notice|notice of sale/),
    hasPayoffRequest:
      has(/payoff|reinstate|reinstatement|good through/) || docTitle(/payoff|reinstatement/),
    hasResponseFiled:
      docDone(/response|demand|challenge/) ||
      has(/sent a response|filed a response|mailed a letter|reserved rights/),
    hasPaymentTendered:
      has(/\bpaid\b|payment sent|tendered|settled|brought current|reinstated/) ||
      docDone(/release|settlement/),
    hasSaleScheduled: has(/sale date|first tuesday|trustee sale|foreclosure sale|tax sale/),
    hasResolved:
      has(/lien released|title cleared|closed on the house|foreclosure stopped|sale canceled/) ||
      docDone(/release|settlement|dismissal/),
  };
}

function detectPath(text: string): LienPath {
  if (/mechanic|materialman|contractor lien|construction lien|lien affidavit/.test(text))
    return "mechanics_lien";
  if (/mortgage|deed of trust|trustee sale|notice of default|behind on mortgage/.test(text))
    return "mortgage_foreclosure";
  if (/judgment lien|abstract of judgment/.test(text)) return "judgment_lien";
  if (/property tax|tax lien|tax foreclosure|delinquent tax|irs lien|federal tax lien/.test(text))
    return "tax_lien";
  if (/title exception|title defect|encumbrance|cloud on title|can't close|schedule b|title commitment/.test(text))
    return "title_encumbrance";
  return "general";
}

const PATH_LABELS: Record<LienPath, string> = {
  mechanics_lien: "Mechanic's / Materialman's Lien",
  mortgage_foreclosure: "Mortgage Foreclosure",
  judgment_lien: "Judgment Lien",
  tax_lien: "Tax Lien",
  title_encumbrance: "Title / Encumbrance",
  general: "Property Lien",
};

function stagesFor(path: LienPath, s: Signals): Omit<RoadmapStage, "status">[] {
  const common: Omit<RoadmapStage, "status">[] = [
    {
      key: "identify",
      title: "Identify every lien on the property",
      body: "Pull the title commitment or run a county-records search. List every deed of trust, lien affidavit, abstract of judgment, tax lien, and easement — with recording dates, amounts, and claimant names.",
      tip: "In Texas, liens are in the county clerk's real-property records for the county where the land sits.",
    },
    {
      key: "deadlines",
      title: "Map deadlines and sale dates",
      body: "Foreclosure sales, lien-filing windows, and tax-sale dates are unforgiving. Write down every date from every notice — especially the trustee's sale date (first Tuesday of the month) and any cure deadline.",
    },
    {
      key: "homestead",
      title: "Confirm homestead status and protections",
      body: "Is this your homestead? Texas protects it from most judgment creditors — but not from your mortgage, property taxes, home-equity loans, or a valid mechanic's lien for work on the home.",
    },
    {
      key: "respond",
      title: "Respond in writing and demand figures",
      body: "Send a dated written response or payoff demand. Request itemized amounts, challenge defects (late lien, missing notice), and reserve all rights. Certified mail creates a record.",
    },
    {
      key: "cure",
      title: "Pay, bond, negotiate, or litigate",
      body: "Options depend on the lien type: reinstate the mortgage, bond off a mechanic's lien, pay or settle the debt, challenge homestead exposure, or defend in court. A sale can sometimes be stopped only days before it happens.",
    },
    {
      key: "release",
      title: "Get a formal release recorded",
      body: "After payment or settlement, demand a release filed in the county records. Do not close a sale or refinance until the title company confirms every exception is cleared.",
    },
  ];

  if (path === "mortgage_foreclosure") {
    return [
      common[0],
      {
        key: "notices",
        title: "Review every default and sale notice",
        body: "Compare the notice of default, notice of sale, and acceleration letter to your deed of trust. Texas requires mailed notice at least 21 days before the sale. Defects may be a defense.",
        tip: "Call the servicer's loss-mitigation line the same day you get a notice — ask for reinstatement and payoff figures in writing.",
      },
      common[2],
      {
        key: "loss_mit",
        title: "Explore loss mitigation before sale day",
        body: "Reinstatement, forbearance, loan modification, or a short sale may be available. You can cure until the moment of sale if you have the funds.",
      },
      common[3],
      common[4],
      common[5],
    ];
  }

  if (path === "mechanics_lien") {
    return [
      common[0],
      {
        key: "notices",
        title: "Check notice and filing deadlines",
        body: "Many mechanic's liens fail because preliminary notice was late or the affidavit was filed after the fourth month (third month for residential). Compare the last-work date to the recording date.",
      },
      common[2],
      common[3],
      {
        key: "bond",
        title: "Bond off the lien if a closing is pending",
        body: "A transfer bond removes the lien from the public records while you fight the amount. This is common when a sale or refinance cannot wait for litigation.",
      },
      common[4],
      common[5],
    ];
  }

  if (path === "tax_lien") {
    return [
      common[0],
      {
        key: "notices",
        title: "Respond to the tax notice immediately",
        body: "Property tax delinquency can lead to a tax suit and foreclosure — and Texas homestead protection does not block a property-tax foreclosure. IRS liens cloud title; a CDP hearing must be requested within 30 days of a Final Notice.",
      },
      common[2],
      common[3],
      {
        key: "plan",
        title: "Set up a payment plan or challenge the amount",
        body: "County tax offices may offer installment agreements. IRS collection alternatives (installment agreement, CNC, OIC) require a formal request — see the tax module for IRS notices.",
      },
      common[4],
      common[5],
    ];
  }

  return common;
}

function completionFor(key: string, s: Signals): boolean {
  switch (key) {
    case "identify":
      return s.hasTitleCommitment || s.hasLienDocument || s.hasResponseFiled;
    case "deadlines":
    case "notices":
      return s.hasLienDocument || s.hasSaleScheduled || s.hasResponseFiled;
    case "homestead":
      return s.hasResponseFiled || s.hasPayoffRequest;
    case "respond":
      return s.hasResponseFiled || s.hasPayoffRequest || s.hasPaymentTendered;
    case "loss_mit":
    case "bond":
    case "plan":
    case "cure":
      return s.hasPaymentTendered || s.hasResolved;
    case "release":
      return s.hasResolved;
    default:
      return false;
  }
}

export function buildLienRoadmap(input: LienRoadmapInput): LienRoadmap {
  const text = [input.matterText ?? "", ...(input.facts ?? [])].join(" ").toLowerCase();
  const path = detectPath(text);
  const signals = deriveSignals(input);
  const blueprints = stagesFor(path, signals);
  const completes = blueprints.map((b) => completionFor(b.key, signals));
  const statuses = assignStageStatuses(completes);

  const urgent =
    signals.hasSaleScheduled ||
    /foreclosure sale|notice of sale|first tuesday|tax sale|save my house/.test(text);

  const stages: RoadmapStage[] = blueprints.map((b, i) => ({
    ...b,
    status: statuses[i],
  }));

  return {
    path,
    pathLabel: PATH_LABELS[path],
    urgent,
    urgentNote: urgent ? URGENT_NOTE : undefined,
    stages,
    disclaimer: DISCLAIMER,
  };
}
