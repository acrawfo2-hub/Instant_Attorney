// ── Employment & labor law statutory registry ────────────────────────────────
//
// Employment is Crawford Law's primary area, and the place clients most often
// arrive scared and on a clock — the agency deadlines (EEOC, TWC) are short and
// unforgiving, and a missed one ends an otherwise-strong claim. This registry
// grounds intake and drafting on the real federal and Texas rules across both
// halves of the practice: transactional documents people are handed (non-competes,
// severance/releases, employer NDAs) and the claims they bring (wrongful
// termination, discrimination, retaliation, wage/hour, leave).
//
// Mirrors lib/debt-statutes.ts: every entry cites an official .gov source. The
// model is constrained to these `key`s and must not invent a citation. General
// legal information, not legal advice.

export type EmploymentCategory =
  | "discrimination"
  | "retaliation"
  | "wage-hour"
  | "leave"
  | "at-will"
  | "non-compete"
  | "severance"
  | "labor-relations"
  | "notice";

export interface EmploymentStatute {
  key: string;
  code: string;
  category: EmploymentCategory;
  jurisdiction: "Federal" | "Texas";
  topic: string;
  summary: string;
  /** What it means for the worker, in plain language. */
  plain_point: string;
  /** A deadline or timing rule to watch, or null. */
  deadline: string | null;
  official_url: string;
  triggers: string[];
}

const EEOC = "https://www.eeoc.gov/laws/guidance";
const DOL_WHD = "https://www.dol.gov/agencies/whd";
const NLRB = "https://www.nlrb.gov/about-nlrb/rights-we-protect/the-law/employees";
const TX_LABOR_21 = "https://statutes.capitol.texas.gov/Docs/LA/htm/LA.21.htm";
const TX_LABOR_61 = "https://statutes.capitol.texas.gov/Docs/LA/htm/LA.61.htm";
const TX_LABOR_451 = "https://statutes.capitol.texas.gov/Docs/LA/htm/LA.451.htm";
const TX_BC_15 = "https://statutes.capitol.texas.gov/Docs/BC/htm/BC.15.htm";

export const EMPLOYMENT_STATUTES: EmploymentStatute[] = [
  {
    key: "title-vii",
    code: "Title VII, 42 U.S.C. § 2000e",
    category: "discrimination",
    jurisdiction: "Federal",
    topic: "Discrimination — race, color, religion, sex, national origin",
    summary:
      "Bars employment discrimination based on race, color, religion, sex (including pregnancy and, under Bostock, sexual orientation and gender identity), or national origin, by employers with 15+ employees. You must file a charge with the EEOC before suing.",
    plain_point:
      "If you were treated worse because of your race, sex, religion, pregnancy, or national origin, this is the main federal law — but you have to file an EEOC charge first.",
    deadline: "File an EEOC charge within 300 days in Texas (a deferral state); after a right-to-sue notice, you have 90 days to sue.",
    official_url: EEOC,
    triggers: ["discrimination", "discriminated", "because of my race", "because of my religion", "pregnancy", "sex discrimination", "national origin", "treated differently"],
  },
  {
    key: "tchra",
    code: "Texas Labor Code Ch. 21 (TCHRA)",
    category: "discrimination",
    jurisdiction: "Texas",
    topic: "Texas Commission on Human Rights Act — state discrimination law",
    summary:
      "The Texas counterpart to Title VII/ADA/ADEA, enforced by the Texas Workforce Commission Civil Rights Division. It covers the same protected classes for employers with 15+ employees, and has its own, shorter filing deadline.",
    plain_point:
      "Texas has its own discrimination law you can use alongside the federal one — but its deadline to file with the state is shorter (180 days), so don't rely on it as a backup.",
    deadline: "File with the TWC Civil Rights Division within 180 days of the discriminatory act.",
    official_url: TX_LABOR_21,
    triggers: ["texas discrimination", "twc", "texas workforce commission", "state discrimination claim"],
  },
  {
    key: "ada",
    code: "ADA, 42 U.S.C. § 12101",
    category: "discrimination",
    jurisdiction: "Federal",
    topic: "Disability discrimination & reasonable accommodation",
    summary:
      "Bars discrimination against a qualified individual with a disability (employers 15+) and requires reasonable accommodation absent undue hardship. Failure to engage in the interactive process or to accommodate can itself be a violation.",
    plain_point:
      "If you have a disability and were fired, not hired, or denied a reasonable accommodation, this protects you — your employer generally has to work with you on accommodations.",
    deadline: "Same EEOC process and deadlines as Title VII (300 days in Texas).",
    official_url: EEOC,
    triggers: ["disability", "accommodation", "reasonable accommodation", "medical condition", "disabled", "ada"],
  },
  {
    key: "adea",
    code: "ADEA, 29 U.S.C. § 621",
    category: "discrimination",
    jurisdiction: "Federal",
    topic: "Age discrimination (40+)",
    summary:
      "Protects workers age 40 and older from age-based discrimination, by employers with 20+ employees. A charge must be filed with the EEOC; after that, suit may be filed (no right-to-sue letter is required).",
    plain_point:
      "If you're 40 or older and were pushed out, replaced by someone much younger, or targeted in a layoff because of age, this is your law.",
    deadline: "File an EEOC charge within 300 days in Texas.",
    official_url: EEOC,
    triggers: ["age discrimination", "too old", "younger replacement", "over 40", "forced retirement", "age"],
  },
  {
    key: "title-vii-retaliation",
    code: "42 U.S.C. § 2000e-3; Tex. Labor Code § 21.055",
    category: "retaliation",
    jurisdiction: "Federal",
    topic: "Retaliation for protected activity",
    summary:
      "It is illegal to punish you for protected activity — complaining about discrimination or harassment, filing or supporting a charge, or requesting an accommodation. Retaliation is one of the most common and provable employment claims, and it can stand even if the underlying complaint doesn't.",
    plain_point:
      "If you got fired or punished AFTER you complained about discrimination/harassment or asserted your rights, retaliation is often the strongest claim — even if the original complaint goes nowhere.",
    deadline: "Same EEOC/TWC charge deadlines as the underlying discrimination claim.",
    official_url: EEOC,
    triggers: ["retaliation", "retaliated", "fired after I complained", "punished for reporting", "whistleblower", "after I reported"],
  },
  {
    key: "flsa",
    code: "FLSA, 29 U.S.C. § 201",
    category: "wage-hour",
    jurisdiction: "Federal",
    topic: "Minimum wage & overtime",
    summary:
      "Requires minimum wage and overtime (1.5× the regular rate over 40 hours/week) for non-exempt employees. Misclassification as 'exempt' or as an independent contractor, off-the-clock work, and unpaid overtime are common violations. You can sue directly — no agency charge is required.",
    plain_point:
      "If you worked overtime and weren't paid time-and-a-half, were misclassified to dodge overtime, or worked off the clock, you can recover back wages — often doubled.",
    deadline: "Sue within 2 years (3 years if the violation was willful).",
    official_url: DOL_WHD,
    triggers: ["overtime", "unpaid wages", "off the clock", "misclassified", "not paid", "minimum wage", "independent contractor", "exempt"],
  },
  {
    key: "texas-payday-law",
    code: "Texas Payday Law, Tex. Labor Code Ch. 61",
    category: "wage-hour",
    jurisdiction: "Texas",
    topic: "Unpaid wages (Texas Payday Law)",
    summary:
      "Lets an employee recover unpaid wages — final pay, commissions, bonuses owed — through a free administrative claim with the Texas Workforce Commission, an alternative to court for many wage disputes.",
    plain_point:
      "If your employer didn't pay your final check, commissions, or wages owed, you can file a free claim with the Texas Workforce Commission.",
    deadline: "File with the TWC within 180 days of when the wages were due.",
    official_url: TX_LABOR_61,
    triggers: ["final paycheck", "didn't pay my commission", "unpaid commission", "withheld my pay", "last check", "payday law"],
  },
  {
    key: "fmla",
    code: "FMLA, 29 U.S.C. § 2601",
    category: "leave",
    jurisdiction: "Federal",
    topic: "Family & medical leave",
    summary:
      "Eligible employees of covered employers (50+ employees) may take up to 12 weeks of unpaid, job-protected leave for their own serious health condition, a family member's, or a new child. Interfering with leave or retaliating for taking it is unlawful.",
    plain_point:
      "If you work for a larger employer and were fired or demoted for taking medical or family leave you were entitled to, that's an FMLA violation.",
    deadline: "Sue within 2 years (3 years if willful).",
    official_url: DOL_WHD,
    triggers: ["fmla", "medical leave", "family leave", "maternity leave", "fired for taking leave", "12 weeks"],
  },
  {
    key: "texas-at-will",
    code: "Texas at-will employment doctrine",
    category: "at-will",
    jurisdiction: "Texas",
    topic: "At-will employment and its limits",
    summary:
      "Texas is an at-will state: absent a contract, an employer may fire an employee for any reason or no reason — but NOT for an illegal reason (discrimination, retaliation, etc.). 'Unfair' is not the same as 'unlawful.'",
    plain_point:
      "In Texas your employer can fire you for almost any reason — even an unfair one — UNLESS it's an illegal reason like discrimination or retaliation. The key question is whether an illegal reason was involved.",
    deadline: null,
    official_url: TX_LABOR_21,
    triggers: ["at will", "can they fire me", "fired for no reason", "is it legal to fire", "wrongful termination", "unfair firing"],
  },
  {
    key: "sabine-pilot",
    code: "Sabine Pilot Service v. Hauck (Texas wrongful discharge)",
    category: "at-will",
    jurisdiction: "Texas",
    topic: "Wrongful discharge for refusing to commit an illegal act",
    summary:
      "A narrow Texas exception to at-will employment: an employer may not fire an employee solely because the employee refused to perform an illegal act that carries criminal penalties.",
    plain_point:
      "If you were fired only because you refused to break the law for your employer, Texas gives you a wrongful-discharge claim.",
    deadline: "Generally a 2-year limitations period — confirm promptly.",
    official_url: "https://www.txcourts.gov/",
    triggers: ["refused to break the law", "fired for not doing something illegal", "wouldn't falsify", "refused to commit", "asked me to do something illegal"],
  },
  {
    key: "workers-comp-retaliation",
    code: "Tex. Labor Code § 451",
    category: "retaliation",
    jurisdiction: "Texas",
    topic: "Workers' compensation retaliation",
    summary:
      "An employer may not fire or discriminate against an employee for filing a workers' compensation claim in good faith, hiring a lawyer to represent them in a claim, or testifying in a comp proceeding.",
    plain_point:
      "If you were fired for filing or pursuing a workers' comp claim after an on-the-job injury, that's illegal retaliation.",
    deadline: "Generally a 2-year limitations period.",
    official_url: TX_LABOR_451,
    triggers: ["workers comp", "workers compensation", "fired after injury", "hurt on the job", "comp claim retaliation"],
  },
  {
    key: "owbpa-severance",
    code: "OWBPA (ADEA), 29 U.S.C. § 626(f)",
    category: "severance",
    jurisdiction: "Federal",
    topic: "Severance waivers of age claims (OWBPA)",
    summary:
      "For a severance agreement to validly waive an age-discrimination (ADEA) claim, it must meet strict rules: it must be written and understandable, advise you to consult a lawyer, give you at least 21 days to consider (45 in a group layoff), and allow 7 days to revoke after signing.",
    plain_point:
      "If you're 40+ and offered severance, the law gives you real time to review it — at least 21 days to consider and 7 days to back out — and the right to have a lawyer look at it. Don't sign on the spot.",
    deadline: "At least 21 days to consider (45 for group layoffs); 7 days to revoke after signing.",
    official_url: EEOC,
    triggers: ["severance", "release", "sign a release", "severance package", "waive my rights", "separation agreement", "21 days", "revoke"],
  },
  {
    key: "tx-noncompete",
    code: "Tex. Bus. & Com. Code §§ 15.50–15.52",
    category: "non-compete",
    jurisdiction: "Texas",
    topic: "Covenants Not to Compete Act",
    summary:
      "A non-compete is enforceable in Texas only if it is ancillary to an otherwise enforceable agreement AND is reasonable in time, geographic area, and scope of activity — no broader than needed to protect the employer's legitimate interest (e.g., trade secrets, goodwill). Overbroad covenants are REFORMED by the court rather than thrown out, and damages/fees for an overbroad covenant are limited.",
    plain_point:
      "A Texas non-compete only holds up if it's tied to a real agreement and is reasonable in how long, how far, and how broad it is. Courts narrow overbroad ones rather than void them — so the question is usually 'how much of it is enforceable,' not 'is any of it.'",
    deadline: null,
    official_url: TX_BC_15,
    triggers: ["non-compete", "noncompete", "covenant not to compete", "can't work for a competitor", "non-solicitation", "restrictive covenant"],
  },
  {
    key: "warn-act",
    code: "WARN Act, 29 U.S.C. § 2101",
    category: "notice",
    jurisdiction: "Federal",
    topic: "Advance notice of mass layoffs",
    summary:
      "Employers with 100+ employees must generally give 60 days' written notice before a plant closing or mass layoff; failure can entitle affected workers to back pay and benefits for the notice period.",
    plain_point:
      "If a large employer laid off a big group with no warning, you may be owed up to 60 days of pay and benefits for the missing notice.",
    deadline: "Claims have their own limitations period — act promptly after the layoff.",
    official_url: DOL_WHD,
    triggers: ["mass layoff", "plant closing", "no notice layoff", "warn act", "sudden layoff", "laid off without notice"],
  },
  {
    key: "nlra-concerted",
    code: "NLRA § 7, 29 U.S.C. § 157",
    category: "labor-relations",
    jurisdiction: "Federal",
    topic: "Protected concerted activity (even without a union)",
    summary:
      "The National Labor Relations Act protects employees — union or not — who engage in 'concerted activity,' such as discussing wages or working conditions together or acting jointly to improve them. Retaliation for it is an unfair labor practice handled by the NLRB.",
    plain_point:
      "Even without a union, you have the right to talk with coworkers about pay and working conditions and to act together — and it's illegal to be punished for it.",
    deadline: "File an unfair labor practice charge with the NLRB within 6 months.",
    official_url: NLRB,
    triggers: ["talking about pay", "discussing wages", "coworkers together", "concerted activity", "union", "nlrb", "punished for organizing"],
  },
];

export type EmploymentStatuteKey = (typeof EMPLOYMENT_STATUTES)[number]["key"];

const BY_KEY = new Map(EMPLOYMENT_STATUTES.map((s) => [s.key, s]));

export function getEmploymentStatute(key: string): EmploymentStatute | undefined {
  return BY_KEY.get(key);
}

export function isKnownEmploymentStatuteKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact one-line-per-statute catalog for injection into a system prompt. */
export function employmentStatutesForPrompt(): string {
  return EMPLOYMENT_STATUTES.map(
    (s) =>
      `• ${s.key} — ${s.code} (${s.jurisdiction}): ${s.topic}. ${s.plain_point}${
        s.deadline ? ` (Deadline: ${s.deadline})` : ""
      }`
  ).join("\n");
}

/** Offline keyword fallback: surface statutes whose triggers appear in free text. */
export function matchEmploymentStatutesByText(text: string): EmploymentStatute[] {
  const haystack = text.toLowerCase();
  return EMPLOYMENT_STATUTES.filter((s) => s.triggers.some((t) => haystack.includes(t.toLowerCase())));
}
