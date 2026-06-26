// ── Texas HOA / property-owners' association statutory registry ───────────────
//
// Curated, source-cited catalog of the Texas statutes that decide most HOA / POA
// disputes — Tex. Prop. Code Chapter 209 (Texas Residential Property Owners
// Protection Act) and Chapter 202 (construction & enforcement of restrictive
// covenants). This mirrors lib/government-forms.ts: every entry cites the official
// Texas Legislature source, so intake and drafting can GROUND on a real statutory
// right instead of paraphrasing one from memory. The model is constrained to these
// `key`s and must not invent a citation.
//
// This is general legal information, not legal advice. Section summaries are
// intentionally high-level; the linked official text governs.

export type HoaChapter = "209" | "202";

export interface HoaStatute {
  /** Stable identifier referenced by detection + instrument mapping. */
  key: string;
  /** Formal citation, e.g. "Tex. Prop. Code § 209.005". */
  code: string;
  /** Chapter the section lives in. */
  chapter: HoaChapter;
  /** Short topic label for menus and prompts. */
  topic: string;
  /** Plain-English description of what the section does. */
  summary: string;
  /** What the section gives the homeowner, in plain language. */
  homeowner_right: string;
  /** A statutory deadline a homeowner should watch, or null if none specific. */
  deadline: string | null;
  /** Official Texas Legislature source for the chapter text. */
  official_url: string;
  /** Natural-language situations that imply this section, used to guide detection. */
  triggers: string[];
}

const CH_209_URL = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.209.htm";
const CH_202_URL = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.202.htm";

export const HOA_STATUTES: HoaStatute[] = [
  {
    key: "tx-209-records",
    code: "Tex. Prop. Code § 209.005",
    chapter: "209",
    topic: "Right to inspect association books and records",
    summary:
      "An owner may request to inspect and copy the association's books and records. The association must adopt a records production and copying policy and respond to a proper written request.",
    homeowner_right:
      "You can demand to see the association's financial records, meeting minutes, governing documents, and other books and records.",
    deadline:
      "Association must generally produce records (or state when they will be available) within 10 business days of a proper written request.",
    official_url: CH_209_URL,
    triggers: [
      "records request",
      "books and records",
      "financial records",
      "meeting minutes",
      "won't show me documents",
      "inspect HOA records",
    ],
  },
  {
    key: "tx-209-notice-hearing",
    code: "Tex. Prop. Code §§ 209.006–209.007",
    chapter: "209",
    topic: "Notice, opportunity to cure, and hearing before enforcement",
    summary:
      "Before levying a fine or suspending a right, the association must give written notice describing the violation, any amount due, and the owner's right to request a hearing — and, for a curable violation, a reasonable period to cure.",
    homeowner_right:
      "You are entitled to written notice, a chance to cure a curable violation, and a hearing before the board before a fine sticks.",
    deadline:
      "Request a hearing before the board within 30 days after the date of the association's notice.",
    official_url: CH_209_URL,
    triggers: [
      "violation notice",
      "fine",
      "HOA fined me",
      "cure period",
      "request a hearing",
      "enforcement action",
      "warning letter",
    ],
  },
  {
    key: "tx-209-payment-plan",
    code: "Tex. Prop. Code § 209.0062",
    chapter: "209",
    topic: "Alternative payment schedule (payment plan)",
    summary:
      "Associations must adopt reasonable guidelines to allow owners to pay certain delinquent amounts in installments over a defined period.",
    homeowner_right:
      "You can ask to pay overdue assessments on an installment plan under the association's payment-plan policy.",
    deadline: "Request before the association refers the debt to a third-party collector or attorney.",
    official_url: CH_209_URL,
    triggers: [
      "payment plan",
      "can't pay assessment",
      "behind on dues",
      "installment",
      "delinquent assessments",
    ],
  },
  {
    key: "tx-209-priority-payments",
    code: "Tex. Prop. Code § 209.0063",
    chapter: "209",
    topic: "Priority of payments",
    summary:
      "Unless the owner directs otherwise, a payment is applied in a statutory order — delinquent assessments first, ahead of fines and most attorney's fees.",
    homeowner_right:
      "Your payments should be applied to the underlying assessment debt before fines and fees, not the other way around.",
    deadline: null,
    official_url: CH_209_URL,
    triggers: [
      "how payments applied",
      "applied my payment to fines",
      "payment allocation",
      "credited to fines",
    ],
  },
  {
    key: "tx-209-no-foreclose-fines",
    code: "Tex. Prop. Code § 209.009",
    chapter: "209",
    topic: "No foreclosure for fines or attorney's fees alone",
    summary:
      "An association may not foreclose its assessment lien if the debt securing the lien consists solely of fines and/or attorney's fees associated with those fines.",
    homeowner_right:
      "The HOA cannot take your home through foreclosure when the debt is only fines and the lawyer fees on those fines.",
    deadline: null,
    official_url: CH_209_URL,
    triggers: [
      "foreclosure",
      "foreclose",
      "lien for fines",
      "losing my home over fines",
      "foreclose over fines",
    ],
  },
  {
    key: "tx-209-foreclosure-notice",
    code: "Tex. Prop. Code § 209.0091",
    chapter: "209",
    topic: "Notice and opportunity to cure before foreclosure",
    summary:
      "Before foreclosing an assessment lien, the association must send the owner notice of the total amount due and give an opportunity to cure the delinquency.",
    homeowner_right:
      "You must receive notice of the full amount owed and a chance to cure before any foreclosure of the lien.",
    deadline: "Cure within the period stated in the association's notice (commonly at least 30 days).",
    official_url: CH_209_URL,
    triggers: [
      "foreclosure notice",
      "notice of sale",
      "cure before foreclosure",
      "amount due before foreclosure",
    ],
  },
  {
    key: "tx-209-open-meetings",
    code: "Tex. Prop. Code § 209.0051",
    chapter: "209",
    topic: "Open board meetings",
    summary:
      "Regular and special board meetings must be open to owners, with advance notice, subject to limited matters the board may discuss in a closed (executive) session.",
    homeowner_right:
      "You are entitled to notice of board meetings and to attend them, except for narrow closed-session topics.",
    deadline: null,
    official_url: CH_209_URL,
    triggers: [
      "board meeting",
      "closed meeting",
      "secret board decision",
      "meeting notice",
      "executive session",
    ],
  },
  {
    key: "tx-202-reasonable",
    code: "Tex. Prop. Code § 202.004",
    chapter: "202",
    topic: "Enforcement must be reasonable; civil damages",
    summary:
      "An association's exercise of discretionary authority over a restrictive covenant must be reasonable. A court may assess civil damages of up to $200 for each day of a continuing violation of a restriction.",
    homeowner_right:
      "Selective, arbitrary, or unreasonable enforcement of the covenants can be challenged as unreasonable.",
    deadline: null,
    official_url: CH_202_URL,
    triggers: [
      "selective enforcement",
      "unreasonable enforcement",
      "arbitrary",
      "singled out",
      "they let neighbors do it",
    ],
  },
  {
    key: "tx-202-solar",
    code: "Tex. Prop. Code § 202.010",
    chapter: "202",
    topic: "Solar energy devices",
    summary:
      "A property owners' association generally may not include or enforce a covenant that prohibits or restricts an owner from installing a solar energy device, subject to limited exceptions.",
    homeowner_right:
      "You generally have the right to install solar panels despite a covenant to the contrary, within narrow limits.",
    deadline: null,
    official_url: CH_202_URL,
    triggers: ["solar panels", "solar energy", "HOA denied solar", "rooftop solar"],
  },
  {
    key: "tx-202-flags",
    code: "Tex. Prop. Code § 202.011",
    chapter: "202",
    topic: "Display of certain flags",
    summary:
      "An association may not prohibit an owner from displaying the U.S., Texas, or an official military-branch flag, though it may adopt reasonable rules on size, placement, and number.",
    homeowner_right:
      "You may display the U.S., Texas, or a military flag, subject only to reasonable rules.",
    deadline: null,
    official_url: CH_202_URL,
    triggers: ["flag", "flagpole", "display flag", "american flag"],
  },
  {
    key: "tx-202-religious",
    code: "Tex. Prop. Code § 202.018",
    chapter: "202",
    topic: "Display of religious items",
    summary:
      "An association may not enforce a covenant to prohibit an owner from displaying a religious item on the entry to the owner's dwelling, subject to size and other reasonable limits.",
    homeowner_right:
      "You may display a religious item (e.g., on your door or door frame) within the statutory size limits.",
    deadline: null,
    official_url: CH_202_URL,
    triggers: ["religious display", "mezuzah", "cross on door", "religious item", "door frame"],
  },
  {
    key: "tx-202-political-signs",
    code: "Tex. Prop. Code § 202.009",
    chapter: "202",
    topic: "Political signs",
    summary:
      "An association may not prohibit an owner from displaying a political sign on the owner's property in advance of an election, subject to reasonable regulation.",
    homeowner_right:
      "You may display a political sign on your own property before an election, within reasonable rules.",
    deadline: null,
    official_url: CH_202_URL,
    triggers: ["political sign", "yard sign", "campaign sign", "election sign"],
  },
];

export type HoaStatuteKey = (typeof HOA_STATUTES)[number]["key"];

const BY_KEY = new Map(HOA_STATUTES.map((s) => [s.key, s]));

export function getHoaStatute(key: string): HoaStatute | undefined {
  return BY_KEY.get(key);
}

export function isKnownHoaStatuteKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact one-line-per-statute catalog for injection into a system prompt. */
export function hoaStatutesForPrompt(): string {
  return HOA_STATUTES.map(
    (s) =>
      `• ${s.key} — ${s.code}: ${s.topic}. ${s.homeowner_right}${
        s.deadline ? ` (Deadline: ${s.deadline})` : ""
      }`
  ).join("\n");
}

/** Offline keyword fallback: surface statutes whose triggers appear in free text. */
export function matchHoaStatutesByText(text: string): HoaStatute[] {
  const haystack = text.toLowerCase();
  return HOA_STATUTES.filter((s) =>
    s.triggers.some((t) => haystack.includes(t.toLowerCase()))
  );
}
