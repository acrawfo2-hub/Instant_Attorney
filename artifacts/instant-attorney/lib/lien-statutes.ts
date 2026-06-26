// ── Texas property-lien & encumbrance statutory registry ─────────────────────
//
// Curated, source-cited catalog of the Texas statutes that decide how liens
// attach to real property, what they mean for homeowners and buyers, and what
// deadlines and remedies apply. Covers mechanic's/materialman's liens (Prop.
// Code Ch. 53), judgment liens (Ch. 52), mortgage/deed-of-trust foreclosure
// (Ch. 51), homestead protections (Ch. 41), state tax liens, and the federal
// tax-lien framework — plus how these interact with ordinary consumer debt.
//
// HOA assessment liens live in lib/hoa-statutes.ts; health-insurance subrogation
// liens live in lib/pi-instruments.ts. This module is the general real-property
// lien knowledge base.
//
// General legal information, not legal advice. Summaries are high-level; the
// linked official text governs.

export type LienCategory =
  | "mechanics"
  | "judgment"
  | "mortgage"
  | "homestead"
  | "tax"
  | "title"
  | "release";

export interface LienStatute {
  /** Stable identifier referenced by detection + instrument mapping. */
  key: string;
  /** Formal citation, e.g. "Tex. Prop. Code § 53.021". */
  code: string;
  category: LienCategory;
  /** "Federal" or "Texas". */
  jurisdiction: "Federal" | "Texas";
  topic: string;
  summary: string;
  /** What the law gives the property owner (or buyer) in plain language. */
  owner_right: string;
  /** A deadline or timing rule to watch, or null. */
  deadline: string | null;
  official_url: string;
  triggers: string[];
}

const TX_PR_53 = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.53.htm";
const TX_PR_52 = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.52.htm";
const TX_PR_51 = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.51.htm";
const TX_PR_41 = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.41.htm";
const TX_PR_32 = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.32.htm";
const IRS_TAX_LIEN = "https://www.irs.gov/businesses/small-businesses-self-employed/understanding-a-federal-tax-lien";
const IRS_CDP = "https://www.irs.gov/businesses/small-businesses-self-employed/collection-due-process-hearings";

export const LIEN_STATUTES: LienStatute[] = [
  // ── Mechanic's / materialman's liens (Ch. 53) ───────────────────────────────
  {
    key: "tx-53-right-to-lien",
    code: "Tex. Prop. Code § 53.021",
    category: "mechanics",
    jurisdiction: "Texas",
    topic: "Right to lien for labor, materials, or specially fabricated items",
    summary:
      "A person who furnishes labor or materials for construction, alteration, or repair of a house, building, or improvement — or specially fabricates materials for the project — has a constitutional and statutory lien on the improved property and the owner's interest in it.",
    owner_right:
      "If a contractor, subcontractor, or supplier claims you owe them for work on your property, they may have a lien right — but only if they followed Texas's strict notice and filing rules. A lien you never heard about may be defective.",
    deadline: null,
    official_url: TX_PR_53,
    triggers: [
      "mechanic's lien",
      "mechanics lien",
      "materialman's lien",
      "contractor lien",
      "construction lien",
      "lien affidavit",
      "did work on my house",
      "supplier lien",
    ],
  },
  {
    key: "tx-53-residential-notice",
    code: "Tex. Prop. Code § 53.254",
    category: "mechanics",
    jurisdiction: "Texas",
    topic: "Residential construction contract notice (owner's disclosure)",
    summary:
      "On a residential project, the owner must receive a statutory disclosure that the property is subject to mechanic's liens if the contractor or subcontractors are not paid — before the contract is signed.",
    owner_right:
      "If you never got the residential lien disclosure before signing your remodel or build contract, that can affect whether certain lien claimants can enforce against your homestead.",
    deadline: "Disclosure must be given before the residential construction contract is signed.",
    official_url: TX_PR_53,
    triggers: [
      "residential construction",
      "remodel contract",
      "home renovation",
      "never got disclosure",
      "contractor disclosure",
      "53.254",
    ],
  },
  {
    key: "tx-53-preliminary-notice",
    code: "Tex. Prop. Code §§ 53.056, 53.252",
    category: "mechanics",
    jurisdiction: "Texas",
    topic: "Preliminary notice for subcontractors and suppliers",
    summary:
      "Most subcontractors and material suppliers on non-residential work must send a preliminary notice by the 15th day of the second month after each month they furnish labor or materials. Residential claimants have a different notice scheme under § 53.252.",
    owner_right:
      "A lien filed by a sub or supplier who never sent the required preliminary notice may be invalid — ask for proof of every notice they claim to have sent.",
    deadline:
      "Preliminary notice generally due by the 15th day of the second month after the month labor/materials were furnished (non-residential); residential rules differ.",
    official_url: TX_PR_53,
    triggers: [
      "preliminary notice",
      "second month notice",
      "subcontractor notice",
      "supplier notice",
      "never got notice from sub",
    ],
  },
  {
    key: "tx-53-lien-filing-deadline",
    code: "Tex. Prop. Code §§ 53.052, 53.056",
    category: "mechanics",
    jurisdiction: "Texas",
    topic: "Deadline to file the lien affidavit",
    summary:
      "A mechanic's lien claimant must file a sworn lien affidavit in the county clerk's records by the 15th day of the fourth calendar month after the month in which the claimant last furnished labor or materials (or, for a single-family residential project, by the 15th day of the third month).",
    owner_right:
      "A lien recorded after the statutory deadline is generally void — compare the last work date on the affidavit to the recording date.",
    deadline:
      "File lien affidavit by the 15th day of the 4th month after last work (3rd month for single-family residential); suit to foreclose within 2 years (1 year for residential homestead).",
    official_url: TX_PR_53,
    triggers: [
      "lien filing deadline",
      "when was lien filed",
      "late lien",
      "lien recorded",
      "county clerk lien",
      "fourth month",
    ],
  },
  {
    key: "tx-53-bond-to-remove",
    code: "Tex. Prop. Code §§ 53.121–53.125",
    category: "mechanics",
    jurisdiction: "Texas",
    topic: "Bond to remove (discharge) a mechanic's lien",
    summary:
      "An owner (or a general contractor) can remove a mechanic's lien from the property records by posting a bond in the amount of the lien plus costs, which shifts the dispute to a lawsuit on the bond instead of clouding title.",
    owner_right:
      "If a disputed lien is blocking a sale or refinance, you may be able to bond it off the property records while you fight the amount in court.",
    deadline: "Act before a foreclosure sale on the lien; bonding does not admit the debt is owed.",
    official_url: TX_PR_53,
    triggers: [
      "bond off lien",
      "remove lien from title",
      "discharge lien",
      "lien blocking sale",
      "can't refinance because of lien",
      "transfer bond",
    ],
  },
  {
    key: "tx-53-priority",
    code: "Tex. Prop. Code §§ 53.122, 53.123",
    category: "mechanics",
    jurisdiction: "Texas",
    topic: "Lien priority vs. purchase-money and construction loans",
    summary:
      "Mechanic's liens relate back to the date work began and can have priority over later-recorded encumbrances, but purchase-money deeds of trust and certain construction loans have special priority rules that can push a mechanic's lien behind the mortgage.",
    owner_right:
      "Who gets paid first from a foreclosure sale depends on recording dates, the type of mortgage, and whether notices were proper — priority disputes often decide whether you still owe a contractor after the bank takes the property.",
    deadline: null,
    official_url: TX_PR_53,
    triggers: [
      "lien priority",
      "who gets paid first",
      "mortgage vs mechanic lien",
      "construction loan",
      "purchase money deed of trust",
    ],
  },
  {
    key: "tx-53-release-duty",
    code: "Tex. Prop. Code § 53.152",
    category: "release",
    jurisdiction: "Texas",
    topic: "Duty to release a mechanic's lien after payment",
    summary:
      "When a mechanic's lien has been paid, settled, or bonded off, the claimant must file a release in the county records within a short period after demand and tender of the statutory fee.",
    owner_right:
      "After you pay or settle, you can demand a formal lien release — and a claimant who refuses may owe you damages and attorney's fees.",
    deadline: "Release generally due within 10 days after payment/settlement and proper demand.",
    official_url: TX_PR_53,
    triggers: [
      "lien release",
      "release of lien",
      "paid contractor still has lien",
      "won't release lien",
      "clear title after payment",
    ],
  },

  // ── Judgment liens (Ch. 52) ───────────────────────────────────────────────
  {
    key: "tx-52-judgment-lien",
    code: "Tex. Prop. Code Ch. 52",
    category: "judgment",
    jurisdiction: "Texas",
    topic: "Abstract of judgment creates a lien on non-exempt property",
    summary:
      "When a creditor obtains a judgment and files an abstract of judgment in the county where the debtor owns real property, the judgment becomes a lien on that property (other than the homestead for most debts). The lien can cloud title and must be satisfied or released to sell or refinance.",
    owner_right:
      "A judgment lien on your house is serious — but your Texas homestead is usually protected from forced sale for ordinary consumer debts. Non-homestead land and investment property are not.",
    deadline:
      "Judgment lien lasts 10 years from filing and can be renewed; suit on the underlying judgment is generally 10 years.",
    official_url: TX_PR_52,
    triggers: [
      "judgment lien",
      "abstract of judgment",
      "judgment on my house",
      "judgment recorded",
      "creditor won lawsuit",
      "judgment against me",
    ],
  },
  {
    key: "tx-52-homestead-exception",
    code: "Tex. Prop. Code § 52.001; Tex. Const. art. XVI § 50",
    category: "homestead",
    jurisdiction: "Texas",
    topic: "Homestead generally immune from judgment-lien forced sale",
    summary:
      "Texas homestead law bars the forced sale of a homestead to satisfy most judgment debts. Exceptions include purchase-money mortgages, home-equity loans, taxes, owelty liens in divorce, and certain mechanic's liens — but not ordinary credit-card or medical judgments.",
    owner_right:
      "A judgment creditor usually cannot take your homestead to pay a credit card or medical bill — but the lien may still appear on title and can attach to non-homestead property you own.",
    deadline: null,
    official_url: TX_PR_41,
    triggers: [
      "lien on my house",
      "lose my house",
      "homestead",
      "judgment on homestead",
      "can they take my home",
      "force sale of home",
    ],
  },

  // ── Mortgage / deed-of-trust foreclosure (Ch. 51) ───────────────────────────
  {
    key: "tx-51-security-instrument",
    code: "Tex. Prop. Code Ch. 51",
    category: "mortgage",
    jurisdiction: "Texas",
    topic: "Deed of trust as a voluntary lien; power of sale",
    summary:
      "Most Texas home loans are secured by a deed of trust (not a judicial mortgage). The deed of trust gives the lender a lien on the property and, on default, the right to non-judicial foreclosure through a trustee's sale after giving required notices.",
    owner_right:
      "Missing mortgage payments puts your home at risk of foreclosure — Texas is a non-judicial foreclosure state, meaning the lender can sell the property at a trustee's sale without suing you first, if the deed of trust and notices comply with law.",
    deadline: null,
    official_url: TX_PR_51,
    triggers: [
      "deed of trust",
      "mortgage default",
      "behind on mortgage",
      "foreclosure",
      "trustee sale",
      "notice of default",
    ],
  },
  {
    key: "tx-51-foreclosure-notice",
    code: "Tex. Prop. Code § 51.002",
    category: "mortgage",
    jurisdiction: "Texas",
    topic: "Notice requirements before a non-judicial foreclosure sale",
    summary:
      "Before a trustee's foreclosure sale, the borrower must receive a mailed notice of default and intent to accelerate, then a notice of sale posted, filed, and mailed — with the sale date at least 21 days after the notice of sale is mailed.",
    owner_right:
      "Foreclosure is not instant — you are entitled to specific notices with dates. Compare every notice to your loan documents; defective notice can be a defense.",
    deadline:
      "Notice of sale must be mailed at least 21 days before the sale date; sale is on the first Tuesday of the month at the county courthouse steps.",
    official_url: TX_PR_51,
    triggers: [
      "notice of sale",
      "foreclosure sale date",
      "first tuesday",
      "trustee sale notice",
      "21 day notice",
      "foreclosure notice",
    ],
  },
  {
    key: "tx-51-cure-right",
    code: "Tex. Prop. Code § 51.002(d)",
    category: "mortgage",
    jurisdiction: "Texas",
    topic: "Right to cure default before the foreclosure sale",
    summary:
      "A borrower may stop a non-judicial foreclosure by curing the default — paying the amount needed to reinstate the loan — up until the foreclosure sale is held, unless the deed of trust provides a shorter window.",
    owner_right:
      "If you can bring the loan current (reinstatement) or pay off the loan before the trustee's sale, you can stop the foreclosure — but you need the exact payoff/reinstatement figure from the servicer in writing.",
    deadline: "Cure/reinstate before the scheduled trustee's sale (typically first Tuesday of the month).",
    official_url: TX_PR_51,
    triggers: [
      "cure default",
      "reinstate loan",
      "stop foreclosure",
      "payoff amount",
      "bring loan current",
      "save my house",
    ],
  },
  {
    key: "tx-51-deficiency",
    code: "Tex. Prop. Code § 51.003",
    category: "mortgage",
    jurisdiction: "Texas",
    topic: "Deficiency judgment after foreclosure",
    summary:
      "If a home is sold at foreclosure for less than the loan balance, the lender may sue for the deficiency within two years — but anti-deficiency protections apply to certain purchase-money loans on homestead property.",
    owner_right:
      "Even after foreclosure, you might still owe money — but Texas limits deficiency suits on some homestead purchase-money loans. Get the sale price and loan balance in writing.",
    deadline: "Lender must sue for deficiency within two years after the foreclosure sale.",
    official_url: TX_PR_51,
    triggers: [
      "deficiency",
      "still owe after foreclosure",
      "sold for less than owed",
      "deficiency judgment",
      "underwater foreclosure",
    ],
  },

  // ── Homestead & permitted liens (Ch. 41) ──────────────────────────────────
  {
    key: "tx-41-homestead-shield",
    code: "Tex. Prop. Code Ch. 41; Tex. Const. art. XVI §§ 50, 51",
    category: "homestead",
    jurisdiction: "Texas",
    topic: "Homestead protection from forced sale",
    summary:
      "Texas protects the homestead from forced sale by most creditors, with no dollar cap on value (subject to acreage limits). This is why ordinary judgment creditors rarely reach a family's home — but voluntary liens you sign (mortgage, home equity) and certain statutory liens still apply.",
    owner_right:
      "Your homestead is one of the strongest asset protections in the country — but it does not erase liens you agreed to (your mortgage) or special debts like taxes and some construction liens.",
    deadline: null,
    official_url: TX_PR_41,
    triggers: [
      "homestead protection",
      "protected from creditors",
      "can't take my house",
      "texas homestead",
      "unlimited homestead",
    ],
  },
  {
    key: "tx-41-permitted-liens",
    code: "Tex. Const. art. XVI § 50(a)",
    category: "homestead",
    jurisdiction: "Texas",
    topic: "Liens that CAN attach to a Texas homestead",
    summary:
      "The homestead is subject to liens for: purchase-money mortgages, home-improvement loans (with limits), home-equity loans (with strict constitutional limits), taxes, owelty of partition in divorce, reverse mortgages, and certain mechanic's liens for work on the homestead.",
    owner_right:
      "Not every lien on your homestead is illegal — your mortgage, property taxes, a valid home-equity loan, and a properly noticed contractor lien can all be enforceable. The question is whether THIS lien fits a permitted category.",
    deadline: null,
    official_url: TX_PR_41,
    triggers: [
      "home equity lien",
      "mortgage on homestead",
      "tax lien on house",
      "contractor lien on home",
      "what liens can attach",
      "permitted lien",
    ],
  },

  // ── Tax liens ─────────────────────────────────────────────────────────────
  {
    key: "tx-state-tax-lien",
    code: "Tex. Tax Code § 32.01; Tex. Prop. Code § 32.01",
    category: "tax",
    jurisdiction: "Texas",
    topic: "State tax lien on property",
    summary:
      "When state taxes (property, franchise, sales) are not paid, Texas can file a tax lien that attaches to all property the taxpayer owns in the county — including homestead. Property tax liens have super-priority and can lead to a tax foreclosure.",
    owner_right:
      "Property tax delinquency is one of the few debts that can force a sale of your homestead — do not ignore a delinquent-tax notice or tax suit.",
    deadline:
      "Property taxes are due January 31; penalties and interest accrue quickly; tax suit/foreclosure timelines follow local collector practice and court orders.",
    official_url: TX_PR_32,
    triggers: [
      "property tax lien",
      "delinquent property taxes",
      "tax foreclosure",
      "comptroller lien",
      "state tax lien",
      "owed property taxes",
    ],
  },
  {
    key: "irs-federal-tax-lien",
    code: "26 U.S.C. § 6321",
    category: "tax",
    jurisdiction: "Federal",
    topic: "Federal tax lien",
    summary:
      "When federal taxes are assessed and demand is made but not paid, the IRS has a lien on all the taxpayer's property — including homestead. The lien is filed as a Notice of Federal Tax Lien in county records and can block sales and refinances.",
    owner_right:
      "A federal tax lien clouds title even if the IRS is not foreclosing yet — you may need a payoff, subordination, or discharge to sell or refinance, and Collection Due Process rights apply after certain notices.",
    deadline:
      "After a Final Notice of Intent to Levy, you generally have 30 days to request a Collection Due Process hearing.",
    official_url: IRS_TAX_LIEN,
    triggers: [
      "federal tax lien",
      "irs lien",
      "notice of federal tax lien",
      "nftl",
      "irs recorded lien",
      "tax lien on property",
    ],
  },
  {
    key: "irs-cdp-hearing",
    code: "26 U.S.C. § 6330",
    category: "tax",
    jurisdiction: "Federal",
    topic: "Collection Due Process hearing after Final Notice",
    summary:
      "After a Final Notice of Intent to Levy, a taxpayer can request a Collection Due Process hearing with the IRS Independent Office of Appeals to challenge the lien/levy and propose collection alternatives (installment agreement, CNC, OIC).",
    owner_right:
      "The CDP hearing is your formal chance to stop or delay enforced collection and propose a payment plan — but the 30-day request window is strict.",
    deadline: "Request CDP hearing within 30 days of the Final Notice of Intent to Levy.",
    official_url: IRS_CDP,
    triggers: [
      "collection due process",
      "cdp hearing",
      "final notice intent to levy",
      "lt11",
      "stop irs levy",
      "appeal irs collection",
    ],
  },

  // ── Title / encumbrance ─────────────────────────────────────────────────────
  {
    key: "tx-title-recording",
    code: "Tex. Prop. Code Ch. 12, 13",
    category: "title",
    jurisdiction: "Texas",
    topic: "Recorded instruments cloud title; title search reveals liens",
    summary:
      "Liens and encumbrances are public record in the county clerk's real-property records. A title company searches these records before a sale or refinance; any unreleased lien, judgment, or deed of trust appears as an exception that must be cleared.",
    owner_right:
      "Before you buy or refinance, pull the title commitment — every listed exception is a lien or claim that must be paid, released, or bonded off at closing.",
    deadline: null,
    official_url: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.12.htm",
    triggers: [
      "title commitment",
      "title exception",
      "encumbrance",
      "cloud on title",
      "can't close because of lien",
      "title company found lien",
      "schedule b exception",
    ],
  },
  {
    key: "tx-lien-waiver-trap",
    code: "Tex. Prop. Code §§ 53.281–53.284",
    category: "title",
    jurisdiction: "Texas",
    topic: "Lien waivers on construction projects",
    summary:
      "Texas regulates lien-waiver forms on construction projects — a 'waiver' signed before payment is received may be void. Owners and lenders use statutory waiver forms at progress-payment milestones.",
    owner_right:
      "Do not sign a blanket lien waiver before you are paid, and do not accept a waiver from a contractor that leaves you exposed to unpaid subcontractor liens.",
    deadline: null,
    official_url: TX_PR_53,
    triggers: [
      "lien waiver",
      "waiver and release",
      "signed lien waiver",
      "conditional waiver",
      "unconditional waiver",
    ],
  },
];

export type LienStatuteKey = (typeof LIEN_STATUTES)[number]["key"];

const BY_KEY = new Map(LIEN_STATUTES.map((s) => [s.key, s]));

export function getLienStatute(key: string): LienStatute | undefined {
  return BY_KEY.get(key);
}

export function isKnownLienStatuteKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact one-line-per-statute catalog for injection into a system prompt. */
export function lienStatutesForPrompt(): string {
  return LIEN_STATUTES.map(
    (s) =>
      `• ${s.key} — ${s.code} (${s.jurisdiction}): ${s.topic}. ${s.owner_right}${
        s.deadline ? ` (Deadline: ${s.deadline})` : ""
      }`
  ).join("\n");
}

/** Offline keyword fallback: surface statutes whose triggers appear in free text. */
export function matchLienStatutesByText(text: string): LienStatute[] {
  const haystack = text.toLowerCase();
  return LIEN_STATUTES.filter((s) =>
    s.triggers.some((t) => haystack.includes(t.toLowerCase()))
  );
}

/** Human-readable impact summary for a matched lien category — used in prompts. */
export function lienImpactGuideForPrompt(): string {
  return `LIEN IMPACT GUIDE (how liens hit Texas property owners):
• Mechanic's/materialman's lien (Ch. 53): Contractor, sub, or supplier unpaid for work on YOUR property can record a lien that clouds title and may be foreclosed. Watch notice deadlines — many liens are void if notices were late. Bonding off removes the cloud while you dispute amount.
• Judgment lien (Ch. 52): After winning a lawsuit, a creditor files an abstract of judgment in your county. It attaches to non-homestead real estate and can block sales. Your homestead is usually protected from forced sale for ordinary debts — but the lien still shows on a title search for non-homestead land.
• Mortgage/deed of trust (Ch. 51): Voluntary lien you agreed to when you borrowed. Default → non-judicial foreclosure with 21+ days' notice → sale on the first Tuesday of the month. Reinstate/cure before sale day if you can.
• Tax lien (state/federal): Property taxes and IRS debts CAN reach homestead. Property tax foreclosure is real. IRS liens cloud title; CDP hearing within 30 days of Final Notice.
• Homestead (Ch. 41 / Const. art. XVI): Shields your home from most judgment creditors — but NOT from mortgage, taxes, home equity, or valid construction liens.
• Title/encumbrance: Any unreleased lien appears on a title commitment and must be cleared to sell or refinance.`;
}
