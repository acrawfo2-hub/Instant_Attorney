// ── Matter Roadmap — non-family practice areas ────────────────────────────────
//
// Authored staged roadmaps for debt/consumer, HOA, employment, and estate
// matters. Uses the same FamilyRoadmap shape so the existing renderer works
// without changes.
//
// Path detection prefers matter_subtype (structured DB field) over free-text
// scanning. Completion signals are derived from facts and document state,
// including real-world language ("we already sent a demand letter", "I filed
// with the EEOC last month").
//
// Deterministic and side-effect free. Fully unit-testable; no I/O.

import type { FamilyRoadmap, RoadmapStage, StageStatus } from "./family-roadmap.ts";

export type MatterArea = "debt" | "hoa" | "employment" | "estate" | "general";

export interface MatterRoadmapInput {
  /** matter_subtype from the DB — primary classification signal. */
  matterSubtype?: string | null;
  /** Summary + subtype combined text for keyword fallback. */
  matterText?: string | null;
  /** Confirmed-fact descriptions from the Living File. */
  facts?: string[];
  /** Documents on file (title + status). */
  documents?: { title: string; status: string }[];
  /** Whether a legal_strategy has been set (used as a proxy for "attorney has reviewed intake"). */
  hasStrategy?: boolean;
}

const DISCLAIMER =
  "This roadmap is general legal information about the typical process for your matter type, not legal advice. Steps can overlap or repeat, and your specific facts and deadlines control. Use it as a map, not a guarantee.";

const DONE_DOC_STATUSES = new Set(["approved", "delivered"]);

// ── Signal derivation ─────────────────────────────────────────────────────────

interface MatterSignals {
  hasDemandLetter: boolean;
  hasInternalEscalation: boolean;
  hasAgencyCharge: boolean;
  hasCourtFiling: boolean;
  hasMediation: boolean;
  hasResolved: boolean;
  hasGovDocs: boolean;
  hasDocumented: boolean;
  hasDraftDocument: boolean;
  hasExecutedDocument: boolean;
  hasInventory: boolean;
  hasTrustFunded: boolean;
}

function deriveSignals(input: MatterRoadmapInput): MatterSignals {
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
    hasDemandLetter:
      docTitle(/demand letter|cease and desist|formal demand/) ||
      has(/(sent|wrote|mailed|emailed).*(demand|letter)|(demand|formal.*letter).*(sent|delivered|mailed)|sent (them|a) (demand|letter)/),

    hasInternalEscalation:
      has(/reported.*hr|hr.*complaint|human resources|board meeting|raised.*board|written request|formal complaint|filed.*complaint.*with/) ||
      has(/wrote to (the |my )?(board|hr|management|supervisor)|sent (a |formal )?(letter|notice|complaint) to/),

    hasAgencyCharge:
      has(/eeoc|twc|nlrb|osha|equal employment|charge.*filed|filed.*charge|agency.*complaint|right to sue/) ||
      has(/filed.*with.*(eeoc|twc|nlrb|commission|agency)|charge number/),

    hasCourtFiling:
      has(/filed.*court|small claims|lawsuit|petition.*filed|filed.*lawsuit|case.*filed|case number|cause number/) ||
      docTitle(/petition|complaint|lawsuit|notice of claim/),

    hasMediation:
      has(/mediation|mediator|arbitration|mediated|alternative dispute/) ||
      has(/(went to|had|completed|attended|scheduled) (mediation|arbitration)/),

    hasResolved:
      docDone(/settlement|release|decree|judgment|final order|stipulation|dismissal|resolution agreement/) ||
      has(/settled|resolved|paid in full|refund.*received|case.*closed|judgment.*granted|won.*case|dismissed/),

    hasGovDocs:
      has(/cc&r|covenants|bylaws|declaration|governing documents|deed restrictions|hoa.*rules/) ||
      docTitle(/cc&r|bylaws|declaration|covenants/),

    hasDocumented:
      has(/documented|timeline|gathered|evidence|records|photos|screenshots|saved.*emails|collected.*records/) ||
      has(/made.*list|log of|record of every|documented every|kept records/),

    hasDraftDocument:
      docTitle(/will|trust|power of attorney|healthcare directive|advance directive|demand letter|agreement|contract/) ||
      has(/(will|trust|power of attorney|poa|directive).*(drafted|created|prepared|completed)/),

    hasExecutedDocument:
      docDone(/will|trust|power of attorney|healthcare directive|advance directive/) ||
      has(/(signed|executed|notarized).*(will|trust|power of attorney)|will.*(signed|executed)|trust.*(signed|funded)/),

    hasInventory:
      has(/inventory|list of assets|estate assets|asset list|what.*own|property list|beneficiar/) ||
      has(/cataloged|inventoried|listed (my |the )?(assets|property|estate)/),

    hasTrustFunded:
      has(/trust.*(funded|established|created|set up)|funded (the |my )?(trust|living trust)|transferred.*into (the |my )trust/) ||
      has(/assets.*transferred.*trust|living trust.*funded/),
  };
}

// ── Area detection ────────────────────────────────────────────────────────────

export function detectMatterArea(
  matterSubtype: string | null | undefined,
  matterText?: string | null,
): MatterArea {
  const t = [(matterSubtype ?? ""), (matterText ?? "")].join(" ").toLowerCase();

  if (/hoa|homeowner.*association|property.*owner.*association|condo.*association|cc&r|covenant|deed restriction/.test(t))
    return "hoa";

  if (/employment|wrongful terminat|wage|discriminat|harassment|retaliat|workplace|fired|laid off|hostile work|labor|title vii|ada\b|fmla|flsa/.test(t))
    return "employment";

  if (/estate|will\b|trust\b|probate|heir|beneficiar|power of attorney|healthcare directive|advance directive|intestate|executor|trustee/.test(t))
    return "estate";

  if (/debt|collect|fdcpa|credit|deposit|contractor|consumer|refund|small.claim|deceptive trade|dtpa|warranty|lemon|garnish|repossess/.test(t))
    return "debt";

  return "general";
}

const AREA_LABELS: Record<MatterArea, string> = {
  debt: "Debt / Consumer Rights",
  hoa: "HOA Dispute",
  employment: "Employment",
  estate: "Estate Planning",
  general: "Your Legal Matter",
};

// ── Stage blueprints ──────────────────────────────────────────────────────────

interface StageBlueprint {
  key: string;
  title: string;
  body: string;
  tip?: string;
  complete: (s: MatterSignals) => boolean;
}

function debtStages(): StageBlueprint[] {
  return [
    {
      key: "document",
      title: "Document the problem",
      body: "Gather everything: the original contract, all payments, receipts, correspondence, and a clear timeline of what happened. Specific dates and dollar amounts are what a demand or court filing needs.",
      tip: "Texas small claims court (Justice Court) handles disputes up to $20,000 with no lawyer required.",
      complete: (s) => s.hasDocumented || s.hasDemandLetter || s.hasCourtFiling,
    },
    {
      key: "rights",
      title: "Know your rights",
      body: "Depending on the situation — unpaid debt, a contractor dispute, a withheld deposit, or a debt collector — specific Texas and federal laws apply with tight deadlines. Your attorney will identify the strongest claims.",
      complete: (s) => s.hasDemandLetter || s.hasCourtFiling || s.hasResolved,
    },
    {
      key: "demand",
      title: "Send a formal demand letter",
      body: "A dated, written demand gives the other side a clear deadline and creates a record. It often resolves the dispute without a court filing — and is sometimes required before you can sue.",
      complete: (s) => s.hasDemandLetter || s.hasCourtFiling || s.hasResolved,
    },
    {
      key: "negotiate",
      title: "Negotiate or dispute",
      body: "After a demand, the other side typically responds. This is when most disputes settle — a payment plan, a lump sum, or a formal dispute letter can close it out.",
      complete: (s) => s.hasMediation || s.hasResolved,
    },
    {
      key: "escalate",
      title: "File in court (if needed)",
      body: "If negotiation fails, Justice Court (small claims) or County/District Court is the next step. Your attorney will advise on the right court for your amount and claims.",
      tip: "Filing fees in small claims are modest. A judgment gives you enforcement tools like wage garnishment.",
      complete: (s) => s.hasResolved || s.hasCourtFiling,
    },
  ];
}

function hoaStages(): StageBlueprint[] {
  return [
    {
      key: "govdocs",
      title: "Pull & review the governing documents",
      body: "The CC&Rs, bylaws, and deed restrictions are the rulebook. Before any dispute goes forward, you need to know exactly what the HOA can and can't do — and what rights owners have.",
      complete: (s) => s.hasGovDocs || s.hasInternalEscalation,
    },
    {
      key: "document",
      title: "Document everything",
      body: "Log every violation notice, fine, correspondence, and board decision with its exact date. Photos, emails, and meeting minutes are your evidence — courts expect specifics.",
      complete: (s) => s.hasDocumented || s.hasInternalEscalation,
    },
    {
      key: "board",
      title: "Raise it formally with the board",
      body: "Send a written request or formal objection to the board. Request the opportunity to be heard at a board meeting. A paper trail showing you followed the process strengthens your position.",
      complete: (s) => s.hasInternalEscalation || s.hasMediation || s.hasResolved,
    },
    {
      key: "adr",
      title: "Alternative dispute resolution",
      body: "Texas law requires HOA disputes to go through an ADR (alternative dispute resolution) process before many lawsuits. Mediation is often faster and cheaper than court.",
      complete: (s) => s.hasMediation || s.hasResolved,
    },
    {
      key: "legal",
      title: "Legal action (if needed)",
      body: "If the board refuses to comply with its own documents or Texas law, a court can issue injunctive relief, a declaratory judgment, or award attorney's fees.",
      complete: (s) => s.hasResolved || s.hasCourtFiling,
    },
  ];
}

function employmentStages(): StageBlueprint[] {
  return [
    {
      key: "document",
      title: "Document everything — now",
      body: "Write down every incident: date, time, who was there, what was said or done. Save emails, pay stubs, offer letters, performance reviews, and text messages. Evidence disappears fast after a termination.",
      tip: "Forward key work emails to a personal account before you lose access.",
      complete: (s) => s.hasDocumented || s.hasInternalEscalation || s.hasAgencyCharge,
    },
    {
      key: "internal",
      title: "Internal complaint (HR or leadership)",
      body: "File a written complaint with HR or the next level of management. This creates an official record, triggers the employer's duty to investigate, and is often required before an agency claim.",
      complete: (s) => s.hasInternalEscalation || s.hasAgencyCharge,
    },
    {
      key: "agency",
      title: "File an agency charge (watch the deadlines)",
      body: "EEOC charges (discrimination, harassment, retaliation) must be filed within 180–300 days of the violation. Texas Workforce Commission (TWC) wage claims have a 180-day deadline. These are hard cutoffs — missing them forecloses your claims.",
      tip: "Deadlines run from the date of the act, not when you discover it. File early.",
      complete: (s) => s.hasAgencyCharge || s.hasResolved,
    },
    {
      key: "negotiate",
      title: "Negotiate / right to sue",
      body: "After an agency charge, the employer often approaches settlement. A severance negotiation or demand letter from counsel at this stage carries real weight — you have a filed charge.",
      complete: (s) => s.hasDemandLetter || s.hasMediation || s.hasResolved,
    },
    {
      key: "resolve",
      title: "Litigation or final resolution",
      body: "If settlement fails, a right-to-sue letter from the EEOC lets you file in federal court. State wage and DTPA claims may proceed in state court independently.",
      complete: (s) => s.hasResolved || s.hasCourtFiling,
    },
  ];
}

function estateStages(): StageBlueprint[] {
  return [
    {
      key: "inventory",
      title: "Take stock — assets, goals, and family",
      body: "List everything you own (and owe), who should receive it, and who you trust to be executor or trustee. Estate planning decisions are only as good as the facts they're built on.",
      complete: (s) => s.hasInventory || s.hasDraftDocument,
    },
    {
      key: "draft",
      title: "Draft the core documents",
      body: "For most people: a will, a durable power of attorney (finances), and a medical power of attorney / advance directive (healthcare). A revocable living trust may also be appropriate to avoid probate.",
      complete: (s) => s.hasDraftDocument,
    },
    {
      key: "trust",
      title: "Fund the trust (if applicable)",
      body: "A trust that isn't funded does nothing. Assets must actually be transferred into the trust — real estate via deed, accounts via beneficiary or re-titling — or they go through probate anyway.",
      tip: "The most common estate-planning mistake: creating a trust, then never funding it.",
      complete: (s) => s.hasTrustFunded || s.hasExecutedDocument,
    },
    {
      key: "execute",
      title: "Sign and execute properly",
      body: "Texas wills require two witnesses (not beneficiaries) and ideally a self-proving affidavit (notarized). Powers of attorney must be notarized. Get this right — defective execution voids the documents.",
      complete: (s) => s.hasExecutedDocument,
    },
    {
      key: "review",
      title: "Review when life changes",
      body: "Marriage, divorce, death of a beneficiary, new children, a major asset acquisition, or a significant change in the law are all triggers to revisit your plan. A will that reflects old facts is almost as bad as no will.",
      complete: () => false,
    },
  ];
}

function generalStages(input: MatterRoadmapInput): StageBlueprint[] {
  return [
    {
      key: "understand",
      title: "Understand your situation",
      body: "Build a clear picture: the parties, the timeline, the key events, and what outcome you're trying to reach. Specificity is what separates a winnable legal position from a vague grievance.",
      complete: (s) => s.hasDocumented || input.hasStrategy === true,
    },
    {
      key: "strategy",
      title: "Identify the law and deadlines",
      body: "Every legal matter has a governing body of law and, usually, a statute of limitations. Your attorney will identify the strongest claims, the weakest points, and any deadlines that constrain your options.",
      complete: (s) => (input.hasStrategy === true) || s.hasDemandLetter || s.hasCourtFiling,
    },
    {
      key: "file",
      title: "Build your file",
      body: "Gather documents, answer your attorney's fact questions, and upload key evidence. A well-built file produces better documents and reduces back-and-forth at the attorney review stage.",
      complete: (s) => s.hasDraftDocument || s.hasDemandLetter,
    },
    {
      key: "action",
      title: "Take formal action",
      body: "This is typically a demand letter, a formal negotiation, an agency complaint, or a court filing — whatever your matter calls for. Your attorney will advise on the right first move.",
      complete: (s) => s.hasDemandLetter || s.hasCourtFiling || s.hasAgencyCharge,
    },
    {
      key: "resolve",
      title: "Resolve or escalate",
      body: "Most matters settle after formal action. If not, escalation — mediation, arbitration, or litigation — is the path to a final resolution.",
      complete: (s) => s.hasResolved || s.hasMediation,
    },
  ];
}

function blueprintsFor(area: MatterArea, input: MatterRoadmapInput): StageBlueprint[] {
  switch (area) {
    case "debt": return debtStages();
    case "hoa": return hoaStages();
    case "employment": return employmentStages();
    case "estate": return estateStages();
    case "general": return generalStages(input);
  }
}

/**
 * Build a staged Roadmap for a non-family legal matter.
 * Returns the same FamilyRoadmap shape so the existing renderer works unchanged.
 * Pass matterSubtype (DB field) as the primary area signal.
 */
export function buildMatterRoadmap(input: MatterRoadmapInput): FamilyRoadmap {
  const area = detectMatterArea(input.matterSubtype, input.matterText);
  const signals = deriveSignals(input);
  const blueprints = blueprintsFor(area, input);

  const completeFlags = blueprints.map((b) => b.complete(signals));
  const firstIncomplete = completeFlags.findIndex((c) => !c);

  const stages: RoadmapStage[] = blueprints.map((b, i) => {
    let status: StageStatus;
    if (completeFlags[i]) status = "done";
    else if (i === firstIncomplete) status = "current";
    else status = "upcoming";
    return { key: b.key, title: b.title, body: b.body, status, ...(b.tip ? { tip: b.tip } : {}) };
  });

  return {
    path: area,
    pathLabel: AREA_LABELS[area],
    safety: false,
    stages,
    disclaimer: DISCLAIMER,
  };
}
