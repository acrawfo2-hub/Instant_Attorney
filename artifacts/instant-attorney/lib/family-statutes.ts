// ── Texas Family Code statutory registry ─────────────────────────────────────
//
// Curated, source-cited catalog of the Texas Family Code provisions that decide
// most middle-class family-law matters — divorce (Ch. 6), property division
// (Ch. 7), spousal maintenance (Ch. 8), conservatorship & possession (Ch. 153),
// child support (Ch. 154), modification (Ch. 156), enforcement (Ch. 157),
// protective orders (Ch. 85), and parentage (Ch. 160).
//
// This mirrors lib/hoa-statutes.ts exactly: every entry cites the official Texas
// Legislature source, so intake and drafting can GROUND on a real statutory
// right instead of paraphrasing one from memory. The model is constrained to
// these `key`s and must not invent a citation.
//
// This is general legal information, not legal advice. Section summaries are
// intentionally high-level; the linked official text governs.

export type FamilyChapter =
  | "3"
  | "6"
  | "7"
  | "8"
  | "85"
  | "153"
  | "154"
  | "156"
  | "157"
  | "160";

export interface FamilyStatute {
  /** Stable identifier referenced by detection + instrument mapping. */
  key: string;
  /** Formal citation, e.g. "Tex. Fam. Code § 6.702". */
  code: string;
  /** Chapter the section lives in. */
  chapter: FamilyChapter;
  /** Short topic label for menus and prompts. */
  topic: string;
  /** Plain-English description of what the section does. */
  summary: string;
  /** What the section gives the person, in plain language. */
  client_right: string;
  /** A statutory deadline or timing rule a person should watch, or null. */
  deadline: string | null;
  /** Official Texas Legislature source for the chapter text. */
  official_url: string;
  /** Natural-language situations that imply this section, used to guide detection. */
  triggers: string[];
}

const FA_URL = (ch: FamilyChapter) =>
  `https://statutes.capitol.texas.gov/Docs/FA/htm/FA.${ch}.htm`;

export const FAMILY_STATUTES: FamilyStatute[] = [
  {
    key: "tx-fam-divorce-grounds",
    code: "Tex. Fam. Code §§ 6.001–6.007",
    chapter: "6",
    topic: "Grounds for divorce (including no-fault)",
    summary:
      "Texas allows a no-fault divorce on the ground of insupportability (discord or conflict of personalities), as well as fault grounds such as cruelty, adultery, and abandonment.",
    client_right:
      "You can seek a divorce without proving wrongdoing — insupportability is enough — though fault grounds can affect property division.",
    deadline: null,
    official_url: FA_URL("6"),
    triggers: [
      "want a divorce",
      "no-fault",
      "insupportability",
      "grounds for divorce",
      "filing for divorce",
      "adultery",
      "cruelty",
    ],
  },
  {
    key: "tx-fam-residency",
    code: "Tex. Fam. Code § 6.301",
    chapter: "6",
    topic: "Residency requirement to file",
    summary:
      "To file for divorce in Texas, a spouse must have been a Texas domiciliary for the preceding 6 months and a resident of the filing county for the preceding 90 days.",
    client_right:
      "You can file in Texas once the 6-month state / 90-day county residency requirement is met.",
    deadline:
      "Must meet 6 months in Texas and 90 days in the county before filing.",
    official_url: FA_URL("6"),
    triggers: [
      "where do I file",
      "residency",
      "just moved",
      "moved to texas",
      "which county",
      "can I file in texas",
    ],
  },
  {
    key: "tx-fam-divorce-waiting",
    code: "Tex. Fam. Code § 6.702",
    chapter: "6",
    topic: "60-day waiting period",
    summary:
      "A court may not grant a divorce before the 60th day after the date the divorce petition was filed, except in narrow circumstances involving family violence.",
    client_right:
      "Your divorce cannot be finalized until at least 60 days after filing — plan the timeline around it.",
    deadline:
      "No decree before the 61st day after the petition is filed (limited family-violence exceptions).",
    official_url: FA_URL("6"),
    triggers: [
      "how long does divorce take",
      "waiting period",
      "60 days",
      "when will it be final",
      "finalize divorce",
    ],
  },
  {
    key: "tx-fam-separate-property",
    code: "Tex. Fam. Code § 3.001",
    chapter: "3",
    topic: "What is separate property",
    summary:
      "A spouse's separate property is property owned or claimed before marriage; property acquired during marriage by gift, devise, or descent (inheritance); and recovery for personal injuries sustained during marriage, except any recovery for loss of earning capacity.",
    client_right:
      "Property you owned before marriage, or received during marriage by gift or inheritance, is your separate property and is not divided in the divorce.",
    deadline: null,
    official_url: FA_URL("3"),
    triggers: [
      "before the marriage",
      "owned before",
      "inheritance",
      "inherited",
      "gift",
      "separate property",
      "premarital asset",
      "personal injury settlement",
    ],
  },
  {
    key: "tx-fam-community-presumption",
    code: "Tex. Fam. Code §§ 3.002–3.003",
    chapter: "3",
    topic: "Community property and the community presumption",
    summary:
      "Community property is all property, other than separate property, acquired by either spouse during marriage. Property possessed by either spouse during or on dissolution of marriage is presumed to be community property, and that presumption can be overcome only by clear and convincing evidence.",
    client_right:
      "Anything acquired during the marriage is presumed community property to be divided — to keep something out, you must clearly prove it is separate.",
    deadline: null,
    official_url: FA_URL("3"),
    triggers: [
      "acquired during marriage",
      "is it community",
      "presumed community",
      "prove separate",
      "commingled",
      "tracing",
    ],
  },
  {
    key: "tx-fam-property-division",
    code: "Tex. Fam. Code § 7.001",
    chapter: "7",
    topic: "Just and right division of the community estate",
    summary:
      "The court divides the spouses' community estate in a manner the court deems just and right, having due regard for the rights of each party and any children. Texas is a community-property state; separate property is not divided.",
    client_right:
      "The marital (community) estate is divided 'just and right' — often but not always 50/50 — while your separate property stays yours.",
    deadline: null,
    official_url: FA_URL("7"),
    triggers: [
      "divide property",
      "who gets the house",
      "community property",
      "separate property",
      "split assets",
      "retirement account",
      "401k",
      "debts",
    ],
  },
  {
    key: "tx-fam-maintenance-eligibility",
    code: "Tex. Fam. Code § 8.051",
    chapter: "8",
    topic: "Eligibility for spousal maintenance",
    summary:
      "Spousal maintenance is limited in Texas. A spouse may qualify if the marriage lasted 10+ years and they lack the ability to earn enough to meet minimum reasonable needs, or in cases involving family violence or a disabling condition.",
    client_right:
      "You may be eligible for court-ordered maintenance if the marriage lasted 10+ years (or family-violence/disability factors apply) and you cannot meet minimum reasonable needs.",
    deadline: null,
    official_url: FA_URL("8"),
    triggers: [
      "alimony",
      "spousal support",
      "spousal maintenance",
      "can I get support",
      "married 10 years",
      "stay at home",
    ],
  },
  {
    key: "tx-fam-maintenance-limits",
    code: "Tex. Fam. Code §§ 8.054–8.055",
    chapter: "8",
    topic: "Caps on maintenance amount and duration",
    summary:
      "Court-ordered maintenance is capped at the lesser of $5,000 per month or 20% of the payor's average monthly gross income, and the duration is limited based on the length of the marriage (commonly 5, 7, or 10 years).",
    client_right:
      "If maintenance is ordered, the law caps both the monthly amount and how long it lasts — set expectations accordingly.",
    deadline: null,
    official_url: FA_URL("8"),
    triggers: [
      "how much alimony",
      "how long alimony",
      "maintenance cap",
      "20 percent",
      "$5000",
    ],
  },
  {
    key: "tx-fam-best-interest",
    code: "Tex. Fam. Code § 153.002",
    chapter: "153",
    topic: "Best interest of the child is the primary consideration",
    summary:
      "The best interest of the child is always the primary consideration of the court in determining issues of conservatorship and possession of and access to the child.",
    client_right:
      "Every custody decision is judged by the child's best interest — not a parent's preference — so frame requests around the child's needs.",
    deadline: null,
    official_url: FA_URL("153"),
    triggers: [
      "custody",
      "best interest",
      "what's best for my child",
      "parenting",
      "conservatorship",
    ],
  },
  {
    key: "tx-fam-conservatorship",
    code: "Tex. Fam. Code §§ 153.131–153.134",
    chapter: "153",
    topic: "Joint vs. sole managing conservatorship",
    summary:
      "There is a rebuttable presumption that appointing the parents as joint managing conservators is in the child's best interest. The court allocates rights and duties (including who decides primary residence) between conservators.",
    client_right:
      "Texas presumes both parents share decision-making (joint managing conservatorship); the fight is usually over specific rights, not 'who wins custody.'",
    deadline: null,
    official_url: FA_URL("153"),
    triggers: [
      "joint custody",
      "sole custody",
      "managing conservator",
      "primary residence",
      "decision making",
      "who decides",
    ],
  },
  {
    key: "tx-fam-spo",
    code: "Tex. Fam. Code §§ 153.252, 153.3101–153.317",
    chapter: "153",
    topic: "Standard Possession Order (possession schedule)",
    summary:
      "For a child 3 or older, the Standard Possession Order is presumed to be in the child's best interest and reasonable. It sets a default schedule (commonly 1st, 3rd, and 5th weekends, a Thursday period, and a holiday/summer split), which differs based on whether the parents live within 100 miles of each other.",
    client_right:
      "There is a default, court-presumed possession schedule (the SPO) you can start from instead of inventing one — it changes if the parents live more than 100 miles apart.",
    deadline: null,
    official_url: FA_URL("153"),
    triggers: [
      "visitation",
      "possession schedule",
      "standard possession",
      "weekends",
      "parenting time",
      "100 miles",
      "summer schedule",
      "holiday schedule",
    ],
  },
  {
    key: "tx-fam-support-guidelines",
    code: "Tex. Fam. Code § 154.125",
    chapter: "154",
    topic: "Child support guideline percentages",
    summary:
      "Guideline child support applies a percentage of the obligor's monthly net resources by number of children before the court (20% for 1, 25% for 2, 30% for 3, 35% for 4, 40% for 5+), applied up to a statutory cap on net resources that is periodically adjusted for inflation.",
    client_right:
      "Child support starts from a clear guideline percentage of the paying parent's net resources, so the likely number is estimable in advance.",
    deadline: null,
    official_url: FA_URL("154"),
    triggers: [
      "child support",
      "how much child support",
      "support amount",
      "guideline support",
      "calculate support",
    ],
  },
  {
    key: "tx-fam-net-resources",
    code: "Tex. Fam. Code §§ 154.061–154.070",
    chapter: "154",
    topic: "What counts as net resources",
    summary:
      "Net resources include wages, self-employment income, and most other income, minus Social Security/income taxes, union dues, and the cost of the child's health and dental insurance. The court can also adjust for a paying parent's other children.",
    client_right:
      "Support is based on 'net resources' — defined by statute — not gross pay, and there's a credit when the paying parent supports other children.",
    deadline: null,
    official_url: FA_URL("154"),
    triggers: [
      "net resources",
      "what income counts",
      "self employed support",
      "other kids",
      "multiple families",
      "health insurance credit",
    ],
  },
  {
    key: "tx-fam-modification",
    code: "Tex. Fam. Code §§ 156.101, 156.401",
    chapter: "156",
    topic: "Modifying custody or support",
    summary:
      "A prior order may be modified if the circumstances of a child, conservator, or party have materially and substantially changed, or, for support, on a showing tied to time elapsed or a guideline difference threshold.",
    client_right:
      "You can ask the court to change an existing custody or support order when there's been a material and substantial change in circumstances.",
    deadline: null,
    official_url: FA_URL("156"),
    triggers: [
      "modify",
      "change custody",
      "change support",
      "lost my job",
      "moving",
      "relocation",
      "material change",
      "new circumstances",
    ],
  },
  {
    key: "tx-fam-enforcement",
    code: "Tex. Fam. Code §§ 157.001–157.166",
    chapter: "157",
    topic: "Enforcing custody or support orders (contempt)",
    summary:
      "A party may file a motion to enforce a final order — for unpaid child support or denied possession — and the court may hold the other party in contempt, order judgment for arrearages, and award attorney's fees.",
    client_right:
      "If the other parent ignores a support or possession order, you can move to enforce it, and the court can order back support, contempt, and fees.",
    deadline: null,
    official_url: FA_URL("157"),
    triggers: [
      "not paying support",
      "behind on child support",
      "denied visitation",
      "won't follow the order",
      "contempt",
      "enforce order",
      "back support",
      "arrears",
    ],
  },
  {
    key: "tx-fam-protective-order",
    code: "Tex. Fam. Code §§ 82.001–85.026",
    chapter: "85",
    topic: "Protective orders for family violence",
    summary:
      "A person who is a victim of family violence (or their household) may apply for a protective order. A court may issue a temporary ex parte order on a showing of a clear and present danger, and a protective order after a hearing, with no filing fee charged to the applicant.",
    client_right:
      "If you or your children face family violence, you can apply for a protective order — including an emergency temporary order — at no filing cost to you.",
    deadline:
      "Seek immediately when there is danger; a temporary ex parte order can issue without prior notice to the other party.",
    official_url: FA_URL("85"),
    triggers: [
      "protective order",
      "restraining order",
      "family violence",
      "abuse",
      "domestic violence",
      "afraid",
      "threatened",
      "hit me",
      "safety",
    ],
  },
  {
    key: "tx-fam-parentage",
    code: "Tex. Fam. Code §§ 160.201–160.637",
    chapter: "160",
    topic: "Establishing parentage (paternity)",
    summary:
      "Parentage can be established by an Acknowledgment of Paternity, a presumption (e.g., marriage), or a court order under the Uniform Parentage Act, and genetic testing may be ordered. Establishing parentage is the gateway to custody and support orders for unmarried parents.",
    client_right:
      "If you are an unmarried parent, establishing legal parentage is the first step that unlocks custody, possession, and support rights.",
    deadline: null,
    official_url: FA_URL("160"),
    triggers: [
      "paternity",
      "establish father",
      "not married",
      "acknowledgment of paternity",
      "DNA test",
      "is he the father",
      "parentage",
    ],
  },
];

export type FamilyStatuteKey = (typeof FAMILY_STATUTES)[number]["key"];

const BY_KEY = new Map(FAMILY_STATUTES.map((s) => [s.key, s]));

export function getFamilyStatute(key: string): FamilyStatute | undefined {
  return BY_KEY.get(key);
}

export function isKnownFamilyStatuteKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact one-line-per-statute catalog for injection into a system prompt. */
export function familyStatutesForPrompt(): string {
  return FAMILY_STATUTES.map(
    (s) =>
      `• ${s.key} — ${s.code}: ${s.topic}. ${s.client_right}${
        s.deadline ? ` (Deadline: ${s.deadline})` : ""
      }`
  ).join("\n");
}

/** Offline keyword fallback: surface statutes whose triggers appear in free text. */
export function matchFamilyStatutesByText(text: string): FamilyStatute[] {
  const haystack = text.toLowerCase();
  return FAMILY_STATUTES.filter((s) =>
    s.triggers.some((t) => haystack.includes(t.toLowerCase()))
  );
}
