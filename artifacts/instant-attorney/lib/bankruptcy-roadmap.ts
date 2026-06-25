// ── Bankruptcy roadmap ───────────────────────────────────────────────────────
//
// Bankruptcy has a defined, unfamiliar process; for a scared filer the unknown is
// the worst part. This pure module lays out the stages — from the required credit
// counseling through discharge — with a best-effort "you are here" derived from
// the Living File facts and documents. Read-only: it writes nothing and changes no
// document. Per-stage completion is tracked independently from light signals (the
// means-test/exemption facts the calculators seed, a filed petition, the
// discharge), so a stage is "done" only with real evidence. Mirrors
// lib/family-roadmap.ts.

export type StageStatus = "done" | "current" | "upcoming";

export interface BankruptcyStage {
  key: string;
  title: string;
  body: string;
  status: StageStatus;
  tip?: string;
}

export interface BankruptcyRoadmap {
  stages: BankruptcyStage[];
  disclaimer: string;
}

export interface BankruptcyRoadmapInput {
  /** Matter subtype + summary, or any free text describing the matter. */
  matterText?: string | null;
  /** Confirmed-fact descriptions from the Living File. */
  facts?: string[];
  /** Documents on file (title + status). */
  documents?: { title: string; status: string }[];
}

const DISCLAIMER =
  "This maps the typical Chapter 7 / Chapter 13 process for general information, not legal advice. Steps and timing vary, and your case's specifics and your district's rules control. Credit counseling and the debtor-education course must be from approved providers.";

const DONE_DOC_STATUSES = new Set(["approved", "delivered"]);

interface Signals {
  consideredOptions: boolean;
  ranMeansTest: boolean;
  checkedExemptions: boolean;
  filedPetition: boolean;
  discharged: boolean;
}

function deriveSignals(input: BankruptcyRoadmapInput): Signals {
  const docs = input.documents ?? [];
  const facts = input.facts ?? [];
  const text = [input.matterText ?? "", ...facts, ...docs.map((d) => d.title)].join(" \n ").toLowerCase();
  const has = (re: RegExp) => re.test(text);
  const docDone = (re: RegExp) => docs.some((d) => re.test(d.title.toLowerCase()) && DONE_DOC_STATUSES.has(d.status));

  return {
    consideredOptions: has(/debt-relief option|chapter 7|chapter 13|means test|disposable income/),
    ranMeansTest: has(/means test|median-income screen|disposable income/),
    checkedExemptions: has(/what you'd keep|exemption|would likely keep/),
    filedPetition: docDone(/bankruptcy petition|voluntary petition/) || has(/petition filed|case filed|automatic stay in effect/),
    discharged: has(/discharge granted|discharged|case closed/),
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
    key: "counseling",
    title: "Credit counseling (required first)",
    body: "Before filing, you must complete a credit-counseling course from an approved provider (usually 60–90 minutes, online or by phone). It's required, and it sometimes surfaces a non-bankruptcy option.",
    tip: "Use a provider on the U.S. Trustee's approved list; fees are low and can be waived for low income.",
    complete: (s) => s.filedPetition || s.discharged,
  },
  {
    key: "picture",
    title: "Gather your financial picture",
    body: "Pull together your income, debts, and assets. Run the means test to see if Chapter 7 is available on income, and check your Texas exemptions to see what you'd keep.",
    tip: "Texas exemptions are generous — most filers keep everything they own.",
    // Complete once both calculators are run, or implicitly once a case is filed
    // (you can't file without this) — the process is genuinely sequential here.
    complete: (s) => (s.ranMeansTest && s.checkedExemptions) || s.filedPetition || s.discharged,
  },
  {
    key: "choose",
    title: "Choose your path",
    body: "Decide between Chapter 7, Chapter 13, or a non-bankruptcy option, based on your income, what you're behind on, and what you want to protect.",
    complete: (s) => s.filedPetition || s.discharged,
  },
  {
    key: "file",
    title: "File the petition — the automatic stay begins",
    body: "Filing the petition and schedules opens your case and triggers the automatic stay, which immediately halts garnishment, lawsuits, foreclosure, and collection calls.",
    tip: "A fee waiver or installment plan is available if you can't pay the filing fee up front.",
    complete: (s) => s.filedPetition || s.discharged,
  },
  {
    key: "meeting",
    title: "341 meeting of creditors",
    body: "About a month after filing, you attend a short meeting where the trustee asks questions under oath about your petition. Creditors rarely show up.",
    complete: (s) => s.discharged,
  },
  {
    key: "education",
    title: "Debtor education course",
    body: "After filing, complete a second required course — a personal financial-management course from an approved provider — before your discharge can be entered.",
    complete: (s) => s.discharged,
  },
  {
    key: "discharge",
    title: "Discharge",
    body: "The court enters your discharge, wiping out the qualifying debts. In a typical Chapter 7 this comes a few months after filing; in Chapter 13 it follows the 3–5 year plan.",
    complete: (s) => s.discharged,
  },
];

/**
 * Build the bankruptcy roadmap with a best-effort "current" stage. Deterministic.
 */
export function buildBankruptcyRoadmap(input: BankruptcyRoadmapInput): BankruptcyRoadmap {
  const signals = deriveSignals(input);
  const completeFlags = STAGES.map((b) => b.complete(signals));
  const firstIncomplete = completeFlags.findIndex((c) => !c);

  const stages: BankruptcyStage[] = STAGES.map((b, i) => {
    let status: StageStatus;
    if (completeFlags[i]) status = "done";
    else if (i === firstIncomplete) status = "current";
    else status = "upcoming";
    return { key: b.key, title: b.title, body: b.body, status, ...(b.tip ? { tip: b.tip } : {}) };
  });

  return { stages, disclaimer: DISCLAIMER };
}
