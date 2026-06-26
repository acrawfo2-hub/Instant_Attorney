// ── Consult fee guidance (attorney phone-assist) ─────────────────────────────
//
// Helps the attorney discuss fair package pricing during a live consult, based
// on the Living File facts we already have. Outputs range estimates for flat-fee
// / phased packages (preferred) with an hourly reference at the firm's rate.
//
// NOT a binding quote. Designed for Tex. Disciplinary R. 1.04 and ABA Model
// Rule 1.5 compliance: preliminary, scope-dependent, subject to written agreement.
//
// Pure compute — fully testable, no I/O.

import { detectMatterFlags } from "./roadmap-build.ts";
import { computeClientEngagement } from "./consult-brief.ts";
import type { CaseFile, ConsultFeeEstimateDraft, Document, FactItem, RequestedAttachment } from "./types.ts";

export const DEFAULT_HOURLY_RATE = 400;

export type FeeComplexity = "straightforward" | "moderate" | "complex" | "highly_complex";

export type BillingModel =
  | "flat_fee"
  | "phased_flat"
  | "limited_scope_menu"
  | "hourly_with_cap"
  | "contingency"
  | "subscription_add_on";

export interface FeeRange {
  low: number;
  high: number;
}

export interface PackageOption {
  id: string;
  label: string;
  description: string;
  billingModel: BillingModel;
  range: FeeRange;
  /** What this package covers — for phone discussion and later engagement letter. */
  scopeIncluded: string[];
  scopeExcluded: string[];
  /** When this package is the best fit. */
  fitNote: string;
  recommended?: boolean;
}

export interface ComplexityFactor {
  label: string;
  impact: "increases" | "decreases" | "neutral";
  note: string;
}

export interface HourlyReference {
  rate: number;
  estimatedHours: FeeRange;
  estimatedTotal: FeeRange;
  note: string;
}

export interface ConsultFeeEstimate {
  version: 1;
  generatedAt: string;
  practiceArea: string;
  practiceAreaLabel: string;
  complexity: FeeComplexity;
  complexityScore: number;
  complexityFactors: ComplexityFactor[];
  /** Primary packages to discuss on the call — flat/phased preferred. */
  packages: PackageOption[];
  hourlyReference: HourlyReference;
  /** Short script the attorney can adapt while on the phone. */
  phoneScript: string;
  scopeIncluded: string[];
  scopeExcluded: string[];
  ethicsNotice: string;
  /** Attorney-facing caveats (contested matter, missing facts, etc.). */
  caveats: string[];
}

/** Re-export draft shape — canonical definition lives in types.ts. */
export type { ConsultFeeEstimateDraft } from "./types.ts";

export interface ConsultFeeEstimateInput {
  caseFile: CaseFile;
  facts: FactItem[];
  documents: Document[];
  requestedAttachments: RequestedAttachment[];
}

export interface MergedFeeEstimate extends ConsultFeeEstimate {
  draft: ConsultFeeEstimateDraft;
  /** Effective range shown to attorney (custom override or recommended package). */
  effectiveRange: FeeRange;
  effectivePackageLabel: string;
}

const ETHICS_NOTICE = [
  "PRELIMINARY ESTIMATE ONLY — NOT A FEE AGREEMENT.",
  "Under Tex. Disciplinary R. 1.04 and ABA Model Rule 1.5, fees must be reasonable and communicated in writing before the client is obligated to pay.",
  "Use these ranges only to orient the client during the consult. Any engagement requires a separate written agreement describing scope, fee structure, and billing terms.",
  "Do not guarantee outcomes. Adjust ranges if new facts emerge. For contingency-fee matters, comply with Rule 1.04(d) (written contingency agreement, client copy, court approval where required).",
].join(" ");

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

function fmtRange(r: FeeRange): string {
  const low = r.low.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const high = r.high.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return `${low} – ${high}`;
}

function clampRange(r: FeeRange): FeeRange {
  return {
    low: round100(Math.max(0, Math.min(r.low, r.high))),
    high: round100(Math.max(r.low, r.high)),
  };
}

function scaleRange(r: FeeRange, factor: number): FeeRange {
  return clampRange({ low: r.low * factor, high: r.high * factor });
}

function corpusText(input: ConsultFeeEstimateInput): string {
  const { caseFile, facts } = input;
  return [
    caseFile.matter_subtype ?? "",
    caseFile.summary ?? "",
    caseFile.title ?? "",
    ...(caseFile.legal_strategy?.risks ?? []),
    ...(caseFile.legal_strategy?.strengths ?? []),
    ...facts.filter((f) => f.status === "confirmed").map((f) => f.description),
  ].join("\n").toLowerCase();
}

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

const CONTESTED = [/contest/i, /disput/i, /fight/i, /refus/i, /denied/i, /litigat/i, /lawsuit/i, /sued/i, /trial/i, /hearing/i];
const UNCONTESTED = [/agreed/i, /uncontested/i, /amicable/i, /settled/i, /cooperat/i];
const URGENT = [/deadline/i, /tomorrow/i, /asap/i, /emergency/i, /temporary order/i, /ex parte/i];
const ASSETS = [/business/i, /llc/i, /rental/i, /retirement/i, /stock/i, /401k/i, /property/i, /house/i, /home/i];
const MULTI_PARTY = [/multiple/i, /several defendant/i, /third party/i, /co-defendant/i];
const HIGH_VALUE = [/\$[\d,]+(?:000|k)/i, /million/i, /substantial/i];

interface ComplexityAssessment {
  score: number;
  level: FeeComplexity;
  factors: ComplexityFactor[];
}

function assessComplexity(input: ConsultFeeEstimateInput): ComplexityAssessment {
  const text = corpusText(input);
  const { caseFile, facts, documents } = input;
  const factors: ComplexityFactor[] = [];
  let score = 0;

  const contested = hasPattern(text, CONTESTED);
  const uncontested = hasPattern(text, UNCONTESTED);
  if (contested) {
    score += 2;
    factors.push({ label: "Contested / adversarial signals", impact: "increases", note: "Expect more negotiation, discovery, or court time." });
  } else if (uncontested) {
    score -= 0.5;
    factors.push({ label: "Cooperative / uncontested signals", impact: "decreases", note: "May fit a streamlined flat-fee package." });
  }

  const gaps = facts.filter((f) => f.status === "gap" && f.kind !== "hypothetical");
  if (gaps.length >= 4) {
    score += 1;
    factors.push({ label: `${gaps.length} open fact gaps`, impact: "increases", note: "More intake and investigation before scoping." });
  } else if (gaps.length === 0) {
    factors.push({ label: "Facts largely confirmed", impact: "decreases", note: "Cleaner scope for a fixed package." });
  }

  const risks = caseFile.legal_strategy?.risks?.length ?? 0;
  if (risks >= 3) {
    score += 1;
    factors.push({ label: "Multiple identified legal risks", impact: "increases", note: "Higher uncertainty — use wider range or phased billing." });
  }

  if (hasPattern(text, URGENT)) {
    score += 0.5;
    factors.push({ label: "Time-sensitive matter", impact: "increases", note: "Rush work or temporary relief may add cost." });
  }

  if (hasPattern(text, ASSETS)) {
    score += 0.5;
    factors.push({ label: "Property / business / financial assets", impact: "increases", note: "Asset tracing or division adds work." });
  }

  if (hasPattern(text, MULTI_PARTY)) {
    score += 1;
    factors.push({ label: "Multiple parties", impact: "increases", note: "Coordination and conflict checks multiply effort." });
  }

  if (hasPattern(text, HIGH_VALUE)) {
    score += 0.5;
    factors.push({ label: "Higher-stakes dollar amounts", impact: "increases", note: "More diligence and documentation expected." });
  }

  const docCount = documents.filter((d) => d.draft_text || d.status === "approved" || d.status === "delivered").length;
  if (docCount >= 3) {
    factors.push({ label: `${docCount} documents on file`, impact: "neutral", note: "Existing drafts may reduce drafting time — or reveal complexity." });
  }

  const engagement = computeClientEngagement(facts, input.requestedAttachments, caseFile);
  if (engagement.level === "high") {
    score -= 0.25;
    factors.push({ label: "Highly engaged client", impact: "decreases", note: "Responsive client often lowers total cost." });
  } else if (engagement.level === "low") {
    score += 0.25;
    factors.push({ label: "Low client engagement so far", impact: "increases", note: "Chasing documents adds overhead — consider in range." });
  }

  if (caseFile.matter_type === "preventive") {
    score -= 0.5;
    factors.push({ label: "Preventive / planning matter", impact: "decreases", note: "Usually fits a defined flat-fee package." });
  }

  let level: FeeComplexity = "moderate";
  if (score <= 0) level = "straightforward";
  else if (score <= 1.5) level = "moderate";
  else if (score <= 3) level = "complex";
  else level = "highly_complex";

  return { score, level, factors };
}

type PracticeKey =
  | "family"
  | "employment"
  | "personal_injury"
  | "estate"
  | "bankruptcy"
  | "debt"
  | "defamation"
  | "contract"
  | "business"
  | "hoa"
  | "general";

function detectPractice(input: ConsultFeeEstimateInput): { key: PracticeKey; label: string } {
  const { caseFile } = input;
  const subtype = (caseFile.matter_subtype ?? "").toLowerCase();
  const text = corpusText(input);

  // Prefer structured matter_subtype when set
  if (/^estate|wills|trust|probate/.test(subtype)) {
    return { key: "estate", label: "Wills & Estates" };
  }
  if (/bankruptcy/.test(subtype)) {
    return { key: "bankruptcy", label: "Bankruptcy" };
  }
  if (/family|divorce|custody|support|marital/.test(subtype)) {
    return { key: "family", label: "Family Law" };
  }
  if (/employment|workplace|termination|retaliation|harassment|wage/.test(subtype)) {
    return { key: "employment", label: "Employment" };
  }
  if (/personal.?injury|\bpi\b|accident|injury/.test(subtype)) {
    return { key: "personal_injury", label: "Personal Injury" };
  }
  if (/defamation|libel|slander/.test(subtype)) {
    return { key: "defamation", label: "Defamation" };
  }
  if (/debt|collection|bankruptcy/.test(subtype)) {
    return { key: "debt", label: "Debt & Collections" };
  }
  if (/hoa|homeowners|association/.test(subtype)) {
    return { key: "hoa", label: "HOA / Property Association" };
  }
  if (/business|llc|corporation|formation/.test(subtype)) {
    return { key: "business", label: "Business Formation" };
  }
  if (/contract|lease|nda|non-compete|agreement/.test(subtype)) {
    return { key: "contract", label: "Contracts & Agreements" };
  }

  const flags = detectMatterFlags(text);

  if (/\bestate\b|\bprobate\b|\btrust\b|power of attorney|\bpoa\b|\bwills\b/i.test(text)) {
    return { key: "estate", label: "Wills & Estates" };
  }
  if (/\bbankruptcy\b|chapter 7|chapter 13/i.test(text)) {
    return { key: "bankruptcy", label: "Bankruptcy" };
  }
  if (flags.isFamilyMatter || /\bdivorce\b|\bcustody\b|child support|family law/i.test(text)) {
    return { key: "family", label: "Family Law" };
  }
  if (flags.isEmploymentMatter) {
    return { key: "employment", label: "Employment" };
  }
  if (flags.isPiMatter) {
    return { key: "personal_injury", label: "Personal Injury" };
  }
  if (flags.isDefamationMatter) {
    return { key: "defamation", label: "Defamation" };
  }
  if (flags.isDebtMatter) {
    return { key: "debt", label: "Debt & Collections" };
  }
  if (/hoa|homeowners association|property owners association/i.test(text)) {
    return { key: "hoa", label: "HOA / Property Association" };
  }
  if (/\bllc\b|business formation|operating agreement/i.test(text)) {
    return { key: "business", label: "Business Formation" };
  }
  if (/\bcontract\b|\blease\b|\bnda\b|non-compete/i.test(text)) {
    return { key: "contract", label: "Contracts & Agreements" };
  }
  return { key: "general", label: "General Civil Matter" };
}

function familyPackages(text: string, complexity: FeeComplexity): PackageOption[] {
  const custody = /custody|possession|visitation|conservatorship/i.test(text);
  const modification = /modif/i.test(text);
  const enforcement = /enforce|contempt|back support|arrearage/i.test(text);
  const divorce = /divorce|dissolution|separate/i.test(text) || (!custody && !modification && !enforcement);
  const uncontested = hasPattern(text, UNCONTESTED) && !hasPattern(text, CONTESTED);

  if (enforcement) {
    return [{
      id: "family-enforcement",
      label: "Enforcement package",
      description: "Motion to enforce, hearing prep, and judgment for arrearages or order violations.",
      billingModel: "flat_fee",
      range: clampRange({ low: 2500, high: 8000 }),
      scopeIncluded: ["Review existing orders", "Prepare enforcement motion", "One hearing (if needed)", "Post-hearing follow-up letter"],
      scopeExcluded: ["Appeals", "Contempt trial beyond one hearing", "New custody modification"],
      fitNote: "Client needs an existing order enforced — not a full divorce.",
      recommended: true,
    }];
  }

  if (modification) {
    return [{
      id: "family-modification",
      label: "Order modification package",
      description: "Petition to modify custody, support, or possession based on material change.",
      billingModel: "flat_fee",
      range: clampRange({ low: 3000, high: 12000 }),
      scopeIncluded: ["Petition/motion to modify", "Mediation prep (if required)", "One contested or agreed hearing"],
      scopeExcluded: ["Full trial", "Multiple appeals", "Property division not in original order"],
      fitNote: "Changing an existing order — scope depends on whether the other side agrees.",
      recommended: true,
    }];
  }

  if (custody && !divorce) {
    return [{
      id: "family-custody",
      label: "Custody / possession package",
      description: "Initial or standalone custody suit — petition through temporary orders or agreed order.",
      billingModel: "phased_flat",
      range: clampRange({ low: 4000, high: 15000 }),
      scopeIncluded: ["Suit filing", "Temporary orders (if needed)", "Mediation", "Final agreed or default order"],
      scopeExcluded: ["Full trial", "Property division", "Appeals"],
      fitNote: "Standalone custody — not bundled with divorce property.",
      recommended: true,
    }];
  }

  const divorceRange = uncontested
    ? clampRange({ low: 3500, high: 7500 })
    : complexity === "highly_complex" || complexity === "complex"
      ? clampRange({ low: 12000, high: 35000 })
      : clampRange({ low: 7500, high: 18000 });

  return [
    {
      id: "family-divorce-uncontested",
      label: uncontested ? "Uncontested divorce package" : "Divorce package (negotiated)",
      description: uncontested
        ? "Agreed divorce — petition through final decree with minimal court involvement."
        : "Divorce with contested issues short of trial — negotiation, mediation, and decree.",
      billingModel: "flat_fee",
      range: divorceRange,
      scopeIncluded: [
        "Initial consult and case assessment",
        "Petition and required disclosures",
        "Mediation (one session)",
        "Final decree and closing letter",
      ],
      scopeExcluded: [
        "Trial",
        "Appeals",
        "Business valuation or forensic accounting",
        "Separate suits (TPS, SAPCR-only)",
      ],
      fitNote: uncontested
        ? "Both parties agree on terms — best flat-fee candidate."
        : "Some disputed issues but settlement likely — phased flat fee recommended.",
      recommended: true,
    },
    {
      id: "family-divorce-phased",
      label: "Phased divorce (pre-trial cap)",
      description: "Phase 1: filing + temporary orders. Phase 2: discovery/mediation. Phase 3: trial prep only if needed.",
      billingModel: "phased_flat",
      range: clampRange({ low: 5000, high: 25000 }),
      scopeIncluded: ["Defined phase scopes with separate flat fees", "Client approves each phase before work begins"],
      scopeExcluded: ["Unlimited trial prep without new agreement", "Expert witnesses (billed separately)"],
      fitNote: "High uncertainty — client pays per phase with written caps.",
      recommended: !uncontested && complexity !== "straightforward",
    },
  ];
}

function employmentPackages(text: string, complexity: FeeComplexity): PackageOption[] {
  const preLit = !hasPattern(text, [/filed suit/i, /lawsuit/i, /court/i, /eeoc.*determination/i]);
  const docReview = /non-compete|severance|nda|review.*offer/i.test(text);

  if (docReview && preLit) {
    return [{
      id: "employment-doc-review",
      label: "Employment document review package",
      description: "Review and written analysis of severance, non-compete, or employment agreement with negotiation letter.",
      billingModel: "flat_fee",
      range: clampRange({ low: 750, high: 2500 }),
      scopeIncluded: ["Document review", "Written memo of issues", "One round of negotiation correspondence"],
      scopeExcluded: ["Litigation", "EEOC charge filing", "Multiple negotiation rounds"],
      fitNote: "Client received a document to sign — not yet in active dispute.",
      recommended: true,
    }];
  }

  return [
    {
      id: "employment-demand",
      label: "Pre-litigation demand package",
      description: "Demand letter, agency charge prep (if applicable), and settlement negotiation.",
      billingModel: "flat_fee",
      range: clampRange({ low: 1500, high: 5000 }),
      scopeIncluded: ["Case evaluation", "Demand letter", "Agency charge drafting (EEOC/TWC if needed)", "Settlement negotiation"],
      scopeExcluded: ["Filing suit", "Discovery", "Trial"],
      fitNote: "Resolve before suit — fixed fee through demand/negotiation phase.",
      recommended: preLit,
    },
    {
      id: "employment-litigation",
      label: "Employment litigation package",
      description: "Suit through resolution (settlement or trial) — phased flat fees with hourly cap fallback.",
      billingModel: "phased_flat",
      range: clampRange({
        low: complexity === "highly_complex" ? 25000 : 12000,
        high: complexity === "highly_complex" ? 75000 : 40000,
      }),
      scopeIncluded: ["Pleading through discovery", "Mediation", "Trial prep (if in scope)", "Phased billing with written caps"],
      scopeExcluded: ["Appeals (separate agreement)", "Expert fees", "Court costs"],
      fitNote: "Active or likely litigation — use phased caps, not open-ended hourly.",
      recommended: !preLit,
    },
  ];
}

function estatePackages(text: string): PackageOption[] {
  const probate = /probate|deceased|death|executor|administrator/i.test(text);
  const trust = /trust|revocable living/i.test(text);
  const couple = /married|spouse|couple|both of us/i.test(text);

  if (probate) {
    return [{
      id: "estate-probate",
      label: "Probate administration package",
      description: "Independent administration — application through discharge (uncontested).",
      billingModel: "flat_fee",
      range: clampRange({ low: 2500, high: 9000 }),
      scopeIncluded: ["Probate application", "Notice to beneficiaries", "Inventory and appraisement", "Closing and discharge"],
      scopeExcluded: ["Contested probate", "Will contest", "Ancillary probate in other states"],
      fitNote: "Texas independent administration — one proceeding.",
      recommended: true,
    }];
  }

  if (trust) {
    return [{
      id: "estate-trust",
      label: "Revocable trust estate plan",
      description: "Trust, pour-over will, POA, and medical directives — plus funding guidance.",
      billingModel: "flat_fee",
      range: clampRange({ low: couple ? 2500 : 1500, high: couple ? 4500 : 3000 }),
      scopeIncluded: ["Trust agreement", "Pour-over will", "Durable POA & directives", "Funding checklist"],
      scopeExcluded: ["Asset retitling (client or title company)", "Tax planning", "Irrevocable trust structures"],
      fitNote: "Avoids probate — higher upfront, lower at death.",
      recommended: true,
    }];
  }

  return [{
    id: "estate-will",
    label: couple ? "Will-based estate plan (couple)" : "Will-based estate plan (individual)",
    description: "Will, durable POA, and medical directives — optional TOD deed add-on.",
    billingModel: "flat_fee",
    range: clampRange({ low: couple ? 800 : 500, high: couple ? 2200 : 1500 }),
    scopeIncluded: ["Last will & testament", "Durable power of attorney", "Medical directives", "Signing ceremony coordination"],
    scopeExcluded: ["Probate at death", "Trust", "Business succession planning"],
    fitNote: "Simple planning — flat fee is appropriate under Rule 1.04.",
    recommended: true,
  }];
}

function buildPackages(practice: PracticeKey, text: string, complexity: FeeComplexity): PackageOption[] {
  switch (practice) {
    case "family":
      return familyPackages(text, complexity);
    case "employment":
      return employmentPackages(text, complexity);
    case "estate":
      return estatePackages(text);
    case "bankruptcy":
      return [{
        id: "bankruptcy-ch7",
        label: "Chapter 7 package",
        description: "Means test through discharge — individual Chapter 7.",
        billingModel: "flat_fee",
        range: clampRange({ low: 1200, high: 2500 }),
        scopeIncluded: ["Counseling session", "Petition and schedules", "341 meeting prep", "Discharge follow-up"],
        scopeExcluded: ["Chapter 13", "Adversary proceedings", "Lien stripping"],
        fitNote: "Straightforward Ch. 7 — statutory flat-fee market in Texas.",
        recommended: !/chapter 13|13/i.test(text),
      }, {
        id: "bankruptcy-ch13",
        label: "Chapter 13 package",
        description: "Plan preparation, confirmation, and monitoring through discharge.",
        billingModel: "flat_fee",
        range: clampRange({ low: 3500, high: 5500 }),
        scopeIncluded: ["Plan drafting", "Confirmation hearing", "Plan monitoring", "Discharge"],
        scopeExcluded: ["Adversary proceedings", "Mortgage modification litigation"],
        fitNote: "Chapter 13 — higher flat fee reflects plan work.",
        recommended: /chapter 13|13/i.test(text),
      }];
    case "personal_injury":
      return [{
        id: "pi-contingency",
        label: "Contingency representation (standard)",
        description: "No fee unless recovery — percentage per written contingency agreement.",
        billingModel: "contingency",
        range: clampRange({ low: 0, high: 0 }),
        scopeIncluded: ["Investigation", "Demand", "Negotiation", "Suit and trial if needed"],
        scopeExcluded: ["Case costs (filing, records) — typically client-advanced or reimbursed"],
        fitNote: "PI is normally contingency (33⅓% pre-suit, up to 40% after suit in Texas). Do NOT quote hourly for full PI rep — use Rule 1.04(d) contingency agreement.",
        recommended: true,
      }, {
        id: "pi-limited",
        label: "Limited scope — demand & negotiation only",
        description: "Flat fee for pre-suit work; client handles suit or hires trial counsel separately.",
        billingModel: "limited_scope_menu",
        range: clampRange({ low: 2500, high: 7500 }),
        scopeIncluded: ["Case evaluation", "Medical record review", "Demand package", "Negotiation with adjuster"],
        scopeExcluded: ["Filing suit", "Trial", "Appeals"],
        fitNote: "Client wants help but not full contingency — limited scope flat fee.",
        recommended: false,
      }];
    case "defamation":
      return [{
        id: "defamation-presuit",
        label: "Pre-suit cease & demand package",
        description: "Evaluation, cease-and-desist, and takedown negotiation before filing.",
        billingModel: "flat_fee",
        range: clampRange({ low: 2000, high: 6000 }),
        scopeIncluded: ["Merits assessment (incl. anti-SLAPP risk)", "Cease-and-desist letter", "Platform takedown requests", "Settlement negotiation"],
        scopeExcluded: ["Filing suit", "Trial", "Appeals"],
        fitNote: "Many defamation matters resolve pre-suit — flat fee through demand phase.",
        recommended: !hasPattern(text, CONTESTED),
      }, {
        id: "defamation-litigation",
        label: "Defamation litigation package",
        description: "Suit through resolution — phased flat with anti-SLAPP exposure noted.",
        billingModel: "phased_flat",
        range: clampRange({ low: 10000, high: 40000 }),
        scopeIncluded: ["Pleading", "Anti-SLAPP response", "Discovery", "Mediation/trial prep"],
        scopeExcluded: ["Appeals", "Fee-shifting exposure if TCPA motion succeeds"],
        fitNote: "High risk — confirm anti-SLAPP analysis before quoting; use phased billing.",
        recommended: hasPattern(text, CONTESTED),
      }];
    case "debt":
      return [{
        id: "debt-defense",
        label: "Debt defense / collection response",
        description: "Answer, discovery, and negotiation in a collection lawsuit.",
        billingModel: "flat_fee",
        range: clampRange({ low: 1500, high: 6000 }),
        scopeIncluded: ["Answer or response", "Discovery responses", "Settlement negotiation", "One hearing if needed"],
        scopeExcluded: ["Bankruptcy (separate engagement)", "Appeals", "Counterclaims beyond FDCPA"],
        fitNote: "Served with collection suit — flat fee through answer and early resolution.",
        recommended: true,
      }];
    case "hoa":
      return [{
        id: "hoa-response",
        label: "HOA dispute response package",
        description: "Review governing docs, violation response, and demand letter to association.",
        billingModel: "flat_fee",
        range: clampRange({ low: 1500, high: 4500 }),
        scopeIncluded: ["Document review (CC&Rs, bylaws)", "Violation response letter", "One negotiation round", "Property Code rights memo"],
        scopeExcluded: ["Litigation", "Appeals", "Assessment payment (client responsibility)"],
        fitNote: "Pre-litigation HOA dispute — most resolve with a firm response.",
        recommended: true,
      }];
    case "business":
      return [{
        id: "business-formation",
        label: "Business formation package",
        description: "Entity formation, EIN guidance, and basic operating agreement.",
        billingModel: "flat_fee",
        range: clampRange({ low: 750, high: 2500 }),
        scopeIncluded: ["Entity selection memo", "Certificate of formation", "Basic operating agreement", "Organizational resolutions"],
        scopeExcluded: ["Securities compliance", "Multi-member complex governance", "Tax elections"],
        fitNote: "Standard LLC formation — flat fee appropriate.",
        recommended: true,
      }];
    case "contract":
      return [{
        id: "contract-review",
        label: "Contract review package",
        description: "Review, redline, and written analysis of a single agreement.",
        billingModel: "flat_fee",
        range: clampRange({ low: 500, high: 2000 }),
        scopeIncluded: ["Full agreement review", "Written issue list", "One round of redlines"],
        scopeExcluded: ["Negotiation calls with third party", "Litigation", "Multiple agreement versions"],
        fitNote: "Single agreement review — scope-limited flat fee.",
        recommended: !hasPattern(text, CONTESTED),
      }, {
        id: "contract-disambiguation",
        label: "Contract dispute package",
        description: "Demand, negotiation, and resolution of a contract disagreement.",
        billingModel: "phased_flat",
        range: clampRange({ low: 3000, high: 15000 }),
        scopeIncluded: ["Breach analysis", "Demand letter", "Negotiation", "Settlement agreement drafting"],
        scopeExcluded: ["Trial", "Appeals", "Arbitration hearing (unless added)"],
        fitNote: "Active contract dispute — phased flat recommended.",
        recommended: hasPattern(text, CONTESTED),
      }];
    default:
      return [{
        id: "general-core",
        label: "Core representation package",
        description: "Defined scope for the central legal work — flat fee based on assessed complexity.",
        billingModel: "flat_fee",
        range: clampRange({
          low: complexity === "straightforward" ? 1500 : complexity === "moderate" ? 3000 : 5000,
          high: complexity === "straightforward" ? 4000 : complexity === "moderate" ? 10000 : 25000,
        }),
        scopeIncluded: ["Initial assessment", "Core legal work as defined in engagement letter", "Regular client updates"],
        scopeExcluded: ["Court appearances beyond scope", "Appeals", "Work outside defined scope"],
        fitNote: "General matter — confirm exact scope on the call before quoting the top of the range.",
        recommended: true,
      }];
  }
}

function adjustPackagesForComplexity(packages: PackageOption[], complexity: FeeComplexity): PackageOption[] {
  const factor =
    complexity === "straightforward" ? 0.9 :
    complexity === "moderate" ? 1 :
    complexity === "complex" ? 1.15 :
    1.3;

  if (factor === 1) return packages;

  return packages.map((p) => {
    if (p.billingModel === "contingency") return p;
    return { ...p, range: scaleRange(p.range, factor) };
  });
}

function buildHourlyReference(packages: PackageOption[], complexity: FeeComplexity): HourlyReference {
  const recommended = packages.find((p) => p.recommended) ?? packages[0];
  const midPackage = recommended ? (recommended.range.low + recommended.range.high) / 2 : 5000;

  const hours: FeeRange =
    complexity === "straightforward" ? { low: 3, high: 10 } :
    complexity === "moderate" ? { low: 8, high: 25 } :
    complexity === "complex" ? { low: 15, high: 50 } :
    { low: 30, high: 100 };

  const hourlyTotal = clampRange({
    low: hours.low * DEFAULT_HOURLY_RATE,
    high: hours.high * DEFAULT_HOURLY_RATE,
  });

  return {
    rate: DEFAULT_HOURLY_RATE,
    estimatedHours: hours,
    estimatedTotal: hourlyTotal,
    note: `Hourly reference only ($${DEFAULT_HOURLY_RATE}/hr). For this matter, a flat package around ${fmtRange(recommended?.range ?? hourlyTotal)} is usually fairer for the client and aligns with Rule 1.04's reasonableness standard — open-ended hourly often exceeds the package midpoint here (~${fmtRange({ low: midPackage * 0.85, high: midPackage * 1.15 })}).`,
  };
}

function buildPhoneScript(
  practiceLabel: string,
  pkg: PackageOption,
  complexity: FeeComplexity,
  caveats: string[],
): string {
  const range = fmtRange(pkg.range);
  const caveat = caveats.length > 0 ? ` I'd want to confirm ${caveats[0].toLowerCase()} before we finalize.` : "";
  return [
    `"Based on what you've shared so far, this looks like a ${complexity.replace("_", " ")} ${practiceLabel.toLowerCase()} matter."`,
    `"For handling the core of your case — ${pkg.label.toLowerCase()} — I'd typically structure this as a ${pkg.billingModel === "flat_fee" ? "flat fee" : pkg.billingModel === "phased_flat" ? "phased flat fee" : "defined-scope package"} in the range of ${range}."`,
    `"That would cover ${pkg.scopeIncluded.slice(0, 2).join(" and ").toLowerCase()}, but not ${pkg.scopeExcluded[0]?.toLowerCase() ?? "work outside that scope"}.${caveat}"`,
    `"This is a preliminary range for our conversation today — not a final quote. If we move forward, I'll send a written engagement agreement with the exact scope and fee before any work begins, as required by Texas ethics rules."`,
  ].join(" ");
}

function buildCaveats(input: ConsultFeeEstimateInput, complexity: FeeComplexity): string[] {
  const caveats: string[] = [];
  const text = corpusText(input);
  const gaps = input.facts.filter((f) => f.status === "gap").length;

  if (gaps > 2) caveats.push("Several facts still unconfirmed — range may change after full intake.");
  if (hasPattern(text, CONTESTED)) caveats.push("Contested matter — consider phased billing with caps rather than a single flat fee.");
  if (complexity === "highly_complex") caveats.push("High complexity — use top of range or hourly-with-cap only after conflict check.");
  if (/personal.?injury|pi\b/i.test(text)) caveats.push("PI matters normally use contingency — do not rely on hourly estimate for full representation.");
  if (/defamation|slapp|tcpa/i.test(text)) caveats.push("Defamation carries anti-SLAPP fee-shifting risk — confirm merits before quoting litigation phase.");

  return caveats;
}

export function emptyFeeEstimateDraft(): ConsultFeeEstimateDraft {
  return {
    version: 1,
    attorneyNotes: "",
    selectedPackageId: null,
    customRange: null,
    adjustmentNote: "",
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeFeeEstimateDraft(raw: unknown): ConsultFeeEstimateDraft {
  if (!raw || typeof raw !== "object") return emptyFeeEstimateDraft();
  const o = raw as Record<string, unknown>;
  const custom = o.customRange as FeeRange | null | undefined;
  return {
    version: 1,
    attorneyNotes: String(o.attorneyNotes ?? ""),
    selectedPackageId: typeof o.selectedPackageId === "string" ? o.selectedPackageId : null,
    customRange: custom && typeof custom.low === "number" && typeof custom.high === "number"
      ? clampRange(custom)
      : null,
    adjustmentNote: String(o.adjustmentNote ?? ""),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  };
}

export function buildConsultFeeEstimate(input: ConsultFeeEstimateInput): ConsultFeeEstimate {
  const text = corpusText(input);
  const practice = detectPractice(input);
  const { level, factors, score } = assessComplexity(input);
  let packages = buildPackages(practice.key, text, level);
  packages = adjustPackagesForComplexity(packages, level);

  // Mark exactly one recommended if none set
  if (!packages.some((p) => p.recommended)) {
    packages[0] = { ...packages[0], recommended: true };
  }

  const recommended = packages.find((p) => p.recommended) ?? packages[0];
  const caveats = buildCaveats(input, level);
  const hourlyReference = buildHourlyReference(packages, level);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    practiceArea: practice.key,
    practiceAreaLabel: practice.label,
    complexity: level,
    complexityScore: score,
    complexityFactors: factors,
    packages,
    hourlyReference,
    phoneScript: buildPhoneScript(practice.label, recommended, level, caveats),
    scopeIncluded: recommended.scopeIncluded,
    scopeExcluded: recommended.scopeExcluded,
    ethicsNotice: ETHICS_NOTICE,
    caveats,
  };
}

export function mergeFeeEstimateWithDraft(
  estimate: ConsultFeeEstimate,
  draft: ConsultFeeEstimateDraft,
): MergedFeeEstimate {
  const selected = draft.selectedPackageId
    ? estimate.packages.find((p) => p.id === draft.selectedPackageId) ?? estimate.packages.find((p) => p.recommended)
    : estimate.packages.find((p) => p.recommended);

  const baseRange = selected?.range ?? estimate.packages[0].range;
  const effectiveRange = draft.customRange ?? baseRange;

  return {
    ...estimate,
    draft,
    effectiveRange,
    effectivePackageLabel: selected?.label ?? estimate.packages[0].label,
  };
}

export function consultFeeEstimateDisclaimer(): string {
  return ETHICS_NOTICE;
}
