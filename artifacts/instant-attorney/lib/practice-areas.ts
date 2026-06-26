// ── Practice-area openers ─────────────────────────────────────────────────────
//
// The landing page routes its practice-area tiles to /free-chat?area=<slug>, but
// the free chat never read that param — so every tile opened the same generic
// chat. This module maps a slug to a tailored opening message and a suggested
// first prompt, so clicking a tile (HOA, employment, landlord, etc.) drops the
// user straight into a guided, area-aware conversation.
//
// Pure data + a lookup, so it is fully unit-testable; the client reads the param
// and swaps the opener with no API change.

export interface PracticeArea {
  slug: string;
  label: string;
  /** Assistant's opening message for this area (replaces the generic greeting). */
  opener: string;
  /** A suggested first message shown to the user as a one-tap starter. */
  starterPrompt: string;
}

const DISCLAIMER =
  "Just so you know upfront: this is general legal information, not legal advice, and this conversation isn't protected by attorney-client privilege.";

export const PRACTICE_AREAS: PracticeArea[] = [
  {
    slug: "hoa",
    label: "HOA / Property-Owners' Association",
    opener: `Hello — I'm glad you reached out. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I help people work through disputes with their HOA or property-owners' association.\n\n${DISCLAIMER}\n\nThese disputes usually turn on two things: what your association's governing documents (the CC&Rs, bylaws, and rules) actually say, and the Texas Property Code rights that protect homeowners. To point you in the right direction — what did your HOA send you, or what are they asking you to do?`,
    starterPrompt: "My HOA sent me a violation notice and I'm not sure what to do.",
  },
  {
    slug: "landlord",
    label: "Landlord / Tenant",
    opener: `Hello — I'm glad you reached out. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I help with landlord–tenant issues like lease disputes, repairs and habitability, security deposits, and eviction.\n\n${DISCLAIMER}\n\nTell me what's happening — are you the tenant or the landlord, and what's the issue?`,
    starterPrompt: "I'm having a dispute with my landlord.",
  },
  {
    slug: "employment",
    label: "Wrongful Termination",
    opener: `Hello — I'm glad you reached out. I'm the Instant Attorney assistant, part of Crawford Law PLLC. Employment matters — wrongful termination, retaliation, and discrimination — are what Crawford Law handles most.\n\n${DISCLAIMER}\n\nTell me what happened at work, starting wherever feels natural.`,
    starterPrompt: "I think I was wrongfully terminated.",
  },
  {
    slug: "harassment",
    label: "Harassment & Retaliation",
    opener: `Hello — I'm glad you reached out. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I help people facing workplace harassment, a hostile environment, or retaliation.\n\n${DISCLAIMER}\n\nWhen you're ready, tell me what's been happening — take it at your own pace.`,
    starterPrompt: "I'm experiencing harassment at work.",
  },
  {
    slug: "personal-injury",
    label: "Personal Injury",
    opener: `Hello — I'm really glad you reached out, and I want you to know: if you've been hurt, you have rights, and timing matters. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I help people work through personal-injury claims — car wrecks, slip-and-falls, medical malpractice, wrongful death, and dealing with insurance adjusters.\n\n${DISCLAIMER}\n\nFirst things first: if you were just injured, are you safe and have you gotten medical care? And if an insurance adjuster has contacted you — tell me about that too. What happened?`,
    starterPrompt: "I was injured in a car accident and an insurance adjuster called me.",
  },
  {
    slug: "debt",
    label: "Debt & Bankruptcy",
    opener: `Hello — I'm really glad you reached out, and I want you to know up front: debt problems are common, they're solvable, and you have real rights here. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I help people deal with debt collectors and think through their options — including, if it comes to it, bankruptcy.\n\n${DISCLAIMER}\n\nOne thing first, because timing matters: if you've been served with a lawsuit or court papers about a debt, tell me right away — there's a deadline to respond. Otherwise, tell me what's going on — who's contacting you, and about what?`,
    starterPrompt: "A debt collector keeps contacting me and I'm not sure what to do.",
  },
  {
    slug: "contract",
    label: "Contracts",
    opener: `Hello — I'm glad you reached out. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I can help you review, draft, or work through a dispute over a contract.\n\n${DISCLAIMER}\n\nWhat kind of contract is it, and what do you need — a review, a new draft, or help with a disagreement?`,
    starterPrompt: "I need help with a contract.",
  },
  {
    slug: "business",
    label: "Business Formation",
    opener: `Hello — I'm glad you reached out. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I can help you set up a business entity the right way — LLC, corporation, or partnership.\n\n${DISCLAIMER}\n\nWhat are you trying to build, and where will the business operate?`,
    starterPrompt: "I want to form a business.",
  },
  {
    slug: "family",
    label: "Family Law",
    opener: `Hello — I'm glad you reached out, and I know matters like these can be hard to talk about. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I help people work through family-law issues — divorce, child custody and support, modifications, and related matters under the Texas Family Code.\n\n${DISCLAIMER}\n\nBefore anything else: if you or your children are in danger or there's been family violence, your safety comes first — tell me and we'll focus there. Otherwise, tell me what's going on in your own words — are we talking about a divorce, children (custody or support), changing an existing order, a prenup or postnup agreement, or something else?`,
    starterPrompt: "I'm thinking about filing for divorce and have kids.",
  },
  {
    slug: "estate",
    label: "Wills & Estates",
    opener: `Hello — I'm glad you reached out. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I can help with wills, trusts, powers of attorney, and estate planning.\n\n${DISCLAIMER}\n\nWhat are you hoping to put in place, and for whom?`,
    starterPrompt: "I'd like to set up a will or estate plan.",
  },
  {
    slug: "nda",
    label: "NDAs & Waivers",
    opener: `Hello — I'm glad you reached out. I'm the Instant Attorney assistant, part of Crawford Law PLLC, and I can help with non-disclosure agreements, non-competes, and liability waivers.\n\n${DISCLAIMER}\n\nWhat do you need — to draft one, review one you've been given, or understand whether one is enforceable?`,
    starterPrompt: "I need help with an NDA or waiver.",
  },
  {
    slug: "other",
    label: "Something Else",
    opener: `Hello — I'm glad you reached out. I'm the Instant Attorney assistant, part of Crawford Law PLLC. You don't need to know what category your situation fits into — we'll figure that out together.\n\n${DISCLAIMER}\n\nTell me what's going on, starting wherever feels natural.`,
    starterPrompt: "",
  },
];

const BY_SLUG = new Map(PRACTICE_AREAS.map((a) => [a.slug, a]));

export function getPracticeArea(slug: string | null | undefined): PracticeArea | undefined {
  if (!slug) return undefined;
  return BY_SLUG.get(slug.toLowerCase());
}

export function isKnownPracticeArea(slug: string): boolean {
  return BY_SLUG.has(slug.toLowerCase());
}
