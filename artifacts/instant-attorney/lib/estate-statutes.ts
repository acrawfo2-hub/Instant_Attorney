// ── Texas estate-planning statutory registry ─────────────────────────────────
//
// Curated, source-cited catalog of the Texas provisions that drive middle-class
// estate planning, asset protection, and probate avoidance — the tools that let
// an ordinary Texas family pass property cheaply and plan for incapacity without
// an expensive trust they may not need.
//
// Two things make Texas unusual and underpin this whole deep dive:
//   1. Independent administration (Est. Code Ch. 401) makes ordinary probate far
//      cheaper and faster than the horror stories assume.
//   2. Texas has NO state estate or inheritance tax, and the federal estate tax
//      reaches only multi-million-dollar estates — so for the middle class the
//      goal is avoiding probate cost and delay, not avoiding tax.
//
// Mirrors lib/family-statutes.ts and lib/debt-statutes.ts: every entry cites an
// official source so intake and drafting GROUND on a real authority instead of
// paraphrasing from memory. The model is constrained to these `key`s and must
// not invent a citation.
//
// This is general legal information, not legal advice. Section summaries are
// intentionally high-level; the linked official text governs.

export type EstateCategory =
  | "probate"
  | "probate-avoidance"
  | "incapacity"
  | "trusts"
  | "homestead"
  | "intestacy"
  | "tax";

export type EstateJurisdiction = "Texas" | "Federal";

export interface EstateStatute {
  /** Stable identifier referenced by the planner engine + instrument mapping. */
  key: string;
  /** Formal citation, e.g. "Tex. Est. Code § 401.003". */
  code: string;
  category: EstateCategory;
  jurisdiction: EstateJurisdiction;
  /** Short topic label for menus and prompts. */
  topic: string;
  /** Plain-English description of what the section does. */
  summary: string;
  /** What the section gives the person, in plain language. */
  client_right: string;
  /** A deadline or timing rule a person should watch, or null. */
  deadline: string | null;
  /** Official source for the provision text (.gov). */
  official_url: string;
  /** Natural-language situations that imply this provision, used for detection. */
  triggers: string[];
}

// Texas Estates Code chapter pages on the official Legislature site.
const EST_URL = (ch: string) =>
  `https://statutes.capitol.texas.gov/Docs/ES/htm/ES.${ch}.htm`;
// Texas Property Code (the Texas Trust Code lives here, not the Estates Code).
const PROP_URL = (ch: string) =>
  `https://statutes.capitol.texas.gov/Docs/PR/htm/PR.${ch}.htm`;

export const ESTATE_STATUTES: EstateStatute[] = [
  // ── Probate: why Texas probate is cheaper than people fear ─────────────────
  {
    key: "tx-independent-administration",
    code: "Tex. Est. Code §§ 401.001–401.008",
    category: "probate",
    jurisdiction: "Texas",
    topic: "Independent administration",
    summary:
      "Texas's signature probate feature: a will can name an independent executor, or the heirs can agree to one, so the estate is settled with minimal court supervision — no court approval for each sale, payment, or distribution and no costly bond in most cases. This is why ordinary Texas probate is far cheaper and faster than the multi-year, percentage-fee horror stories from other states. It is not free, though — it still runs commonly a few thousand dollars and takes some months, and a married couple typically faces two separate probates.",
    client_right:
      "If your will asks for independent administration (or your heirs agree to it), your executor can settle the estate with little court involvement, keeping probate relatively quick and inexpensive.",
    deadline: "A will is generally offered for probate within 4 years of death (Est. Code § 256.003).",
    official_url: EST_URL("401"),
    triggers: ["independent executor", "avoid expensive probate", "probate cost", "settle the estate", "no bond"],
  },
  {
    key: "tx-muniment-of-title",
    code: "Tex. Est. Code §§ 257.001–257.103",
    category: "probate",
    jurisdiction: "Texas",
    topic: "Probate as a muniment of title",
    summary:
      "A streamlined, low-cost probate available when there is a valid will and no unpaid debts other than a mortgage. The court simply admits the will as a 'muniment of title,' transferring property without appointing an executor or opening a full administration.",
    client_right:
      "If you leave a valid will and your estate has no debts beyond a home loan, your heirs can clear title cheaply without a full probate administration.",
    deadline: "Offered for probate generally within 4 years of death.",
    official_url: EST_URL("257"),
    triggers: ["muniment of title", "no debts", "simple will probate", "transfer the house after death"],
  },
  {
    key: "tx-small-estate-affidavit",
    code: "Tex. Est. Code §§ 205.001–205.008",
    category: "probate",
    jurisdiction: "Texas",
    topic: "Small estate affidavit",
    summary:
      "When someone dies WITHOUT a will and the estate (excluding the homestead and exempt property) is worth $75,000 or less, the heirs can use a sworn affidavit — instead of a full probate — to collect and transfer the property after a 30-day wait.",
    client_right:
      "If a relative died without a will and left a modest estate, you may be able to transfer their property with an affidavit rather than opening probate.",
    deadline: "Available no earlier than 30 days after death.",
    official_url: EST_URL("205"),
    triggers: ["died without a will", "small estate", "no will", "affidavit instead of probate"],
  },
  // ── Probate avoidance: the middle-class toolkit ────────────────────────────
  {
    key: "tx-transfer-on-death-deed",
    code: "Tex. Est. Code §§ 114.001–114.151",
    category: "probate-avoidance",
    jurisdiction: "Texas",
    topic: "Transfer on death deed (TODD)",
    summary:
      "A recorded deed that names who inherits your real estate, but transfers nothing until you die — you keep full ownership and control and can revoke it anytime. At death the home passes to the named beneficiary outside probate, with no trust required. For most Texas homeowners this is the single biggest probate-avoidance tool.",
    client_right:
      "You can pass your home to your chosen beneficiary outside probate by recording a revocable transfer-on-death deed, while keeping full control during your life.",
    deadline: "Must be signed, notarized, and RECORDED in the county property records before death to be effective.",
    official_url: EST_URL("114"),
    triggers: ["transfer on death deed", "TODD", "avoid probate on my house", "pass my home", "lady bird deed alternative"],
  },
  {
    key: "tx-payable-on-death-accounts",
    code: "Tex. Est. Code §§ 113.001–113.252",
    category: "probate-avoidance",
    jurisdiction: "Texas",
    topic: "Payable-on-death (POD) & multiple-party accounts",
    summary:
      "Bank and brokerage accounts can name a payable-on-death (POD) or transfer-on-death (TOD) beneficiary, and accounts can carry rights of survivorship. These pass directly to the named person at death outside probate. The same idea drives retirement accounts and life insurance, which pass by beneficiary designation regardless of the will.",
    client_right:
      "You can route bank, investment, retirement, and insurance accounts directly to chosen beneficiaries outside probate by completing the institution's beneficiary form.",
    deadline: "Effective when the form is on file with the institution; review after major life events.",
    official_url: EST_URL("113"),
    triggers: ["payable on death", "POD account", "beneficiary designation", "401k beneficiary", "life insurance beneficiary", "transfer on death"],
  },
  {
    key: "tx-community-property-survivorship",
    code: "Tex. Est. Code §§ 112.051–112.252",
    category: "probate-avoidance",
    jurisdiction: "Texas",
    topic: "Community property survivorship agreement",
    summary:
      "Spouses can sign a written agreement making their community property pass to the survivor automatically at the first death — a probate-avoidance tool unique to community-property states, without needing a trust.",
    client_right:
      "As a married couple you can agree in writing that your community property passes to the surviving spouse outside probate.",
    deadline: null,
    official_url: EST_URL("112"),
    triggers: ["right of survivorship", "spouse inherits everything", "community property agreement", "married avoid probate"],
  },
  // ── Trusts (Texas Trust Code lives in the Property Code) ────────────────────
  {
    key: "tx-revocable-living-trust",
    code: "Tex. Prop. Code §§ 112.001–112.038 (Texas Trust Code)",
    category: "trusts",
    jurisdiction: "Texas",
    topic: "Revocable living trust",
    summary:
      "A trust you create and control during life, holding assets you transfer ('fund') into it. Because the trust — not you personally — owns those assets, they avoid probate and a successor trustee can manage them if you become incapacitated, all privately. The catch: it only works for assets you actually retitle into it, and it costs more to set up than a will. It earns its keep by avoiding probate entirely (including a married couple's second probate), keeping your affairs private, and covering incapacity without a court — benefits that are especially compelling with out-of-state real estate, a desire for privacy, blended-family complexity, or hands-on incapacity planning. Whether that's worth the extra cost over a will-based plan is a personal call; in Texas, where independent administration already keeps probate efficient, the savings alone are often modest.",
    client_right:
      "You can place assets in a revocable trust you control, so they avoid probate and can be managed for you privately if you're incapacitated — provided you fund the trust by retitling those assets into it.",
    deadline: "Only assets retitled into the trust during life are governed by it — funding is the step people skip.",
    official_url: PROP_URL("112"),
    triggers: ["living trust", "revocable trust", "avoid probate trust", "do I need a trust", "trust vs will"],
  },
  {
    key: "tx-special-needs-trust",
    code: "Tex. Prop. Code Ch. 112; 42 U.S.C. § 1396p(d)(4)",
    category: "trusts",
    jurisdiction: "Texas",
    topic: "Special (supplemental) needs trust",
    summary:
      "A trust that holds assets for a beneficiary with a disability so the funds supplement, rather than disqualify them from, means-tested public benefits like SSI and Medicaid. Leaving money outright to a disabled loved one can cost them their benefits; a properly drafted special needs trust protects both.",
    client_right:
      "You can provide for a disabled loved one without jeopardizing their Medicaid/SSI eligibility by leaving assets to a special needs trust instead of to them directly.",
    deadline: null,
    official_url: PROP_URL("112"),
    triggers: ["special needs", "disabled child", "SSI", "Medicaid", "supplemental needs trust", "disabled beneficiary"],
  },
  {
    key: "tx-testamentary-trust",
    code: "Tex. Est. Code Ch. 254; Tex. Prop. Code Ch. 112",
    category: "trusts",
    jurisdiction: "Texas",
    topic: "Testamentary trust (trust created by a will)",
    summary:
      "A trust written into your will that springs into existence at death — commonly used to hold a minor child's inheritance until they're old enough, with a trustee managing it in the meantime. It does not avoid probate (it's part of the will) but it controls WHEN and HOW young or vulnerable beneficiaries receive money.",
    client_right:
      "Your will can create a trust so a young child's inheritance is managed by a trustee and released at ages you choose, instead of handed over in a lump sum at 18.",
    deadline: null,
    official_url: EST_URL("254"),
    triggers: ["minor children inheritance", "trust in my will", "kids get money at 18", "trustee for my children"],
  },
  // ── Incapacity planning ────────────────────────────────────────────────────
  {
    key: "tx-statutory-durable-poa",
    code: "Tex. Est. Code §§ 751.001–752.115",
    category: "incapacity",
    jurisdiction: "Texas",
    topic: "Statutory durable power of attorney",
    summary:
      "A document naming an agent to handle your finances and property, which stays effective ('durable') if you become incapacitated. Without it, your family may need a costly court guardianship to pay your bills if you can't. Texas provides a statutory form.",
    client_right:
      "You can appoint someone you trust to manage your finances if you're unable to, avoiding a court guardianship.",
    deadline: "Must be signed and notarized while you still have capacity.",
    official_url: EST_URL("752"),
    triggers: ["power of attorney", "financial POA", "durable power of attorney", "manage my finances if incapacitated", "avoid guardianship"],
  },
  {
    key: "tx-medical-power-of-attorney",
    code: "Tex. Health & Safety Code §§ 166.151–166.166",
    category: "incapacity",
    jurisdiction: "Texas",
    topic: "Medical power of attorney",
    summary:
      "Names an agent to make health-care decisions for you if a doctor certifies you can't make them yourself. Pairs with a directive to physicians (living will) and an out-of-hospital DNR where appropriate.",
    client_right:
      "You can name someone to make medical decisions for you if you're unable to speak for yourself.",
    deadline: "Sign while you have capacity; effective only after a physician certifies incapacity.",
    official_url: "https://statutes.capitol.texas.gov/Docs/HS/htm/HS.166.htm",
    triggers: ["medical power of attorney", "health care agent", "who makes my medical decisions", "living will"],
  },
  {
    key: "tx-directive-to-physicians",
    code: "Tex. Health & Safety Code §§ 166.031–166.053",
    category: "incapacity",
    jurisdiction: "Texas",
    topic: "Directive to physicians (living will)",
    summary:
      "Your written instructions about life-sustaining treatment if you have a terminal or irreversible condition — so your wishes, not a default, guide end-of-life care and your family isn't left guessing.",
    client_right:
      "You can put your end-of-life treatment wishes in writing so they're honored and your family isn't forced to decide for you.",
    deadline: null,
    official_url: "https://statutes.capitol.texas.gov/Docs/HS/htm/HS.166.htm",
    triggers: ["living will", "directive to physicians", "end of life wishes", "life support", "advance directive"],
  },
  {
    key: "tx-declaration-of-guardian",
    code: "Tex. Est. Code §§ 1104.202–1104.220",
    category: "incapacity",
    jurisdiction: "Texas",
    topic: "Declaration of guardian (for yourself and minor children)",
    summary:
      "Lets you name, in advance, who should serve as guardian of your person/estate if one is ever needed — and, for parents, who should raise your minor children if you can't. Naming a guardian for your kids is one of the most important reasons young parents make an estate plan.",
    client_right:
      "You can choose in advance who would care for you, and who would raise your minor children, instead of leaving it to a court.",
    deadline: "Sign while you have capacity; a guardian for children is typically named in your will.",
    official_url: EST_URL("1104"),
    triggers: ["guardian for my kids", "who raises my children", "name a guardian", "guardianship designation"],
  },
  // ── Homestead & intestacy ──────────────────────────────────────────────────
  {
    key: "tx-homestead-protection",
    code: "Tex. Const. art. XVI §§ 50–51; Tex. Prop. Code §§ 41.001–41.002",
    category: "homestead",
    jurisdiction: "Texas",
    topic: "Homestead protection",
    summary:
      "Texas shields your homestead from most creditors during life (unlimited value, with acreage caps) and protects a surviving spouse's and minor children's right to occupy the home after death. The cornerstone of Texas asset protection — and it applies automatically, no trust required.",
    client_right:
      "Your Texas homestead is protected from most creditors and secures your surviving spouse's and children's right to remain in the home — automatically.",
    deadline: null,
    official_url: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.41.htm",
    triggers: ["homestead", "protect my house from creditors", "asset protection home", "creditor protection"],
  },
  {
    key: "tx-intestate-succession",
    code: "Tex. Est. Code §§ 201.001–201.103",
    category: "intestacy",
    jurisdiction: "Texas",
    topic: "Intestate succession (dying without a will)",
    summary:
      "If you die without a will, Texas law — not you — decides who inherits, and the result surprises many people, especially blended families: separate property and community property pass under different rules, and a surviving spouse may share with the deceased's children or parents. A will (or non-probate transfers) overrides these defaults.",
    client_right:
      "Knowing the default rules shows you what happens if you do nothing — and why a will or beneficiary designations let you choose instead.",
    deadline: null,
    official_url: EST_URL("201"),
    triggers: ["died without a will", "intestate", "who inherits", "no will what happens", "blended family inheritance"],
  },
  // ── Tax (the demystifier) ──────────────────────────────────────────────────
  {
    key: "no-tx-estate-tax",
    code: "Texas has no estate or inheritance tax (repealed)",
    category: "tax",
    jurisdiction: "Texas",
    topic: "No Texas estate or inheritance tax",
    summary:
      "Texas imposes NO state estate tax and NO inheritance tax. For Texans, the estate-tax question is purely federal — and the federal exemption reaches only multi-million-dollar estates. That means for the vast majority of middle-class families, the estate plan is about avoiding probate cost and delay, not about dodging tax.",
    client_right:
      "As a Texan you owe no state death tax, so your planning can focus on a smooth, low-cost transfer rather than tax avoidance.",
    deadline: null,
    official_url: "https://comptroller.texas.gov/taxes/",
    triggers: ["estate tax", "death tax", "inheritance tax texas", "do I owe estate tax"],
  },
  {
    key: "federal-estate-tax-exemption",
    code: "26 U.S.C. § 2010 (federal estate tax unified credit)",
    category: "tax",
    jurisdiction: "Federal",
    topic: "Federal estate-tax exemption",
    summary:
      "The federal estate tax applies only after a very large per-person lifetime exemption — in the multiple millions of dollars and adjusted for inflation each year — and married couples can effectively double it through portability. The practical takeaway for the middle class: a typical estate owes zero federal estate tax, so 'avoiding estate tax' is rarely the reason an ordinary family needs a trust.",
    client_right:
      "Unless your estate runs into the millions, the federal estate tax almost certainly doesn't touch you — confirm the current exemption amount, which is indexed annually.",
    deadline: "The exemption amount is indexed yearly; verify the current figure with the IRS.",
    official_url: "https://www.irs.gov/businesses/small-businesses-self-employed/estate-tax",
    triggers: ["federal estate tax", "estate tax exemption", "how much can I leave tax free", "gift tax"],
  },
];

export type EstateStatuteKey = (typeof ESTATE_STATUTES)[number]["key"];

const BY_KEY = new Map(ESTATE_STATUTES.map((s) => [s.key, s]));

export function getEstateStatute(key: string): EstateStatute | undefined {
  return BY_KEY.get(key);
}

export function isKnownEstateStatuteKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact one-line-per-statute catalog for injection into a system prompt. */
export function estateStatutesForPrompt(): string {
  return ESTATE_STATUTES.map((s) => `${s.key} — ${s.code}: ${s.topic}`).join("\n");
}

/** Offline keyword fallback: surface statutes whose triggers appear in free text. */
export function matchEstateStatutesByText(text: string): EstateStatute[] {
  const hay = text.toLowerCase();
  return ESTATE_STATUTES.filter((s) => s.triggers.some((t) => hay.includes(t.toLowerCase())));
}
