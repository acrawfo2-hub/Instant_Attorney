// ── Estate-planning "get ready" checklist ────────────────────────────────────
//
// A huge share of estate planning isn't legal work at all — it's the practical,
// do-it-yourself prep that makes the legal documents actually work: naming
// beneficiaries, moving and retitling money, recording a deed, and getting your
// passwords and instructions organized so the people you trust can find
// everything. Lawyers can't (and shouldn't bill to) do most of this for you, but
// it's where plans succeed or fail.
//
// This module is the catalog of those tasks, each tagged by WHO does it — you, a
// step you and the attorney do together, or the attorney. Most are "you": that's
// the point. One task is deliberately the What-If game, so a person's "but what
// if X happens?" worries get captured and, over time, built into their strategy
// and the documents we draft.
//
// Pure data + lookup, fully testable. General information, not legal advice.

import type { EstateStatuteKey } from "./estate-statutes.ts";

export type ChecklistCategory =
  | "organize"
  | "beneficiaries"
  | "fund"
  | "digital"
  | "people"
  | "originals"
  | "whatif";

/** Who actually performs the task. Most of this work is the client's to do. */
export type Doer = "you" | "together" | "attorney";

export interface EstateTask {
  key: string;
  title: string;
  detail: string;
  category: ChecklistCategory;
  doer: Doer;
  relevant_statutes: EstateStatuteKey[];
}

export interface CategoryMeta {
  key: ChecklistCategory;
  label: string;
  blurb: string;
}

// Display order — practical prep first, the What-If reflection woven in near the
// front so concerns get captured early, originals/safekeeping last.
export const CHECKLIST_CATEGORIES: CategoryMeta[] = [
  { key: "organize", label: "Take stock", blurb: "Know what you have before you decide where it goes." },
  { key: "whatif", label: "Surface your what-ifs", blurb: "Turn the worries in your head into part of the plan." },
  { key: "beneficiaries", label: "Name your people", blurb: "Free, and it routes assets straight to them outside probate." },
  { key: "fund", label: "Move things into place", blurb: "Retitle and record so the plan actually controls your assets." },
  { key: "digital", label: "Passwords & digital life", blurb: "If no one can log in, the rest barely matters." },
  { key: "people", label: "Tell the right people", blurb: "A plan no one can find is a plan that fails." },
  { key: "originals", label: "Keep the originals safe", blurb: "Findable, not locked away from the people who need them." },
];

export const ESTATE_TASKS: EstateTask[] = [
  // ── Take stock ─────────────────────────────────────────────────────────────
  {
    key: "inventory_assets",
    title: "List what you own and what you owe",
    detail:
      "Make one simple list: accounts (bank, retirement, brokerage), real estate, vehicles, life insurance, and debts. You can't pass on or protect what you haven't accounted for, and your family will need this map.",
    category: "organize",
    doer: "you",
    relevant_statutes: [],
  },
  {
    key: "gather_documents",
    title: "Gather your key documents",
    detail:
      "Pull together deeds and titles, insurance policies, recent account statements, and any prior will or trust. Having them in one place makes every later step faster.",
    category: "organize",
    doer: "you",
    relevant_statutes: [],
  },
  // ── What-if ────────────────────────────────────────────────────────────────
  {
    key: "play_what_if",
    title: "Play the What-If game",
    detail:
      "Estate planning is really about 'what if': what if I'm incapacitated, what if a child isn't ready for money at 18, what if my spouse remarries, what if a beneficiary has creditors or a divorce? Playing the What-If game walks you through these out loud so your concerns get captured — and, over time, built into your strategy and the actual documents we draft for you.",
    category: "whatif",
    doer: "you",
    relevant_statutes: ["tx-testamentary-trust", "tx-special-needs-trust"],
  },
  // ── Name your people (beneficiary designations) ────────────────────────────
  {
    key: "update_beneficiaries",
    title: "Review and update every beneficiary form",
    detail:
      "Retirement accounts, life insurance, and pensions pass by their beneficiary form — and that form OVERRIDES your will. Update them after any marriage, divorce, birth, or death. A forgotten ex-spouse on an old 401(k) inherits it no matter what your will says.",
    category: "beneficiaries",
    doer: "you",
    relevant_statutes: ["tx-payable-on-death-accounts"],
  },
  {
    key: "add_pod_tod",
    title: "Add payable-on-death (POD/TOD) to bank & brokerage accounts",
    detail:
      "Ask your bank and brokerage for the POD/TOD form. It costs nothing, you keep full control while you're alive, and the account passes directly to your chosen person outside probate.",
    category: "beneficiaries",
    doer: "you",
    relevant_statutes: ["tx-payable-on-death-accounts"],
  },
  {
    key: "name_contingents",
    title: "Name backup (contingent) beneficiaries",
    detail:
      "Don't stop at a primary beneficiary — name a backup in case the first person dies before you. Avoid naming a minor or a benefits-dependent loved one directly; flag those so we can route them through the right kind of trust.",
    category: "beneficiaries",
    doer: "you",
    relevant_statutes: ["tx-special-needs-trust", "tx-testamentary-trust"],
  },
  // ── Move things into place (funding) ───────────────────────────────────────
  {
    key: "record_tod_deed",
    title: "Record a transfer-on-death deed for your home",
    detail:
      "This is the cheapest way to keep your home out of probate. We prepare the deed; you sign and notarize it; then it MUST be recorded with the county before death to work. Being willing to take this small step is what makes it real.",
    category: "fund",
    doer: "together",
    relevant_statutes: ["tx-transfer-on-death-deed"],
  },
  {
    key: "fund_trust",
    title: "If you set up a trust, actually fund it",
    detail:
      "A trust only controls assets you retitle INTO it — moving the deed, changing account ownership, updating beneficiaries to the trust. This is the step people skip, and an unfunded trust does nothing. It takes a willingness to move money and re-paper accounts; we'll give you a funding list.",
    category: "fund",
    doer: "together",
    relevant_statutes: ["tx-revocable-living-trust"],
  },
  {
    key: "consolidate_accounts",
    title: "Consolidate scattered old accounts",
    detail:
      "Old 401(k)s and dormant bank accounts are easy to lose and hard for your family to find. Rolling them together makes your estate simpler to manage and to pass on.",
    category: "fund",
    doer: "you",
    relevant_statutes: [],
  },
  // ── Passwords & digital life ───────────────────────────────────────────────
  {
    key: "password_inventory",
    title: "Build a secure password & account inventory",
    detail:
      "List where your accounts live and how to log in — ideally in a password manager, or a sealed written list. Email and your password manager are the master keys; without them, your family can be locked out of everything even with perfect legal documents.",
    category: "digital",
    doer: "you",
    relevant_statutes: [],
  },
  {
    key: "digital_access_plan",
    title: "Make sure a trusted person can actually get in",
    detail:
      "Decide who should reach your phone, email, and password manager, and how they'll get past two-factor or recovery prompts. Many services also let you name a legacy/recovery contact — set those up now.",
    category: "digital",
    doer: "you",
    relevant_statutes: [],
  },
  {
    key: "list_digital_assets",
    title: "Note digital assets worth preserving",
    detail:
      "Photos, domains, loyalty points, crypto, a small business's online accounts — list what matters and where it is, so it isn't lost the moment no one can log in.",
    category: "digital",
    doer: "you",
    relevant_statutes: [],
  },
  // ── Tell the right people ──────────────────────────────────────────────────
  {
    key: "brief_fiduciaries",
    title: "Tell your executor and agents you've chosen them",
    detail:
      "Confirm your executor and your financial/medical agents are willing, and tell them where to find your documents and account inventory. Surprise appointments cause delay and conflict.",
    category: "people",
    doer: "you",
    relevant_statutes: ["tx-statutory-durable-poa", "tx-medical-power-of-attorney"],
  },
  {
    key: "letter_of_instruction",
    title: "Write a plain letter of instruction",
    detail:
      "Not legally binding, but invaluable: a short note telling your family what to do first, who to call, where the documents and passwords are, and any wishes that don't belong in a will. It's the human guide that makes the legal plan usable.",
    category: "people",
    doer: "you",
    relevant_statutes: [],
  },
  // ── Keep the originals safe ────────────────────────────────────────────────
  {
    key: "store_originals",
    title: "Store the signed originals somewhere safe — and findable",
    detail:
      "Texas may require the original signed will to probate it. Keep originals secure but accessible, and make sure at least one trusted person knows exactly where they are.",
    category: "originals",
    doer: "you",
    relevant_statutes: [],
  },
  {
    key: "avoid_safe_deposit_trap",
    title: "Don't lock the only will where no one can reach it",
    detail:
      "A common trap: the sole original will sits in a safe-deposit box the family can't legally open without the very court order the will was meant to avoid. Keep a path for your executor to get to it.",
    category: "originals",
    doer: "you",
    relevant_statutes: [],
  },
];

const BY_KEY = new Map(ESTATE_TASKS.map((t) => [t.key, t]));

export function getEstateTask(key: string): EstateTask | undefined {
  return BY_KEY.get(key);
}

export function isKnownEstateTaskKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Tasks grouped under each category, in display order. Empty groups omitted. */
export function tasksByCategory(): { category: CategoryMeta; tasks: EstateTask[] }[] {
  return CHECKLIST_CATEGORIES.map((category) => ({
    category,
    tasks: ESTATE_TASKS.filter((t) => t.category === category.key),
  })).filter((g) => g.tasks.length > 0);
}

/** How many of the catalog's tasks are the client's own to do (most of them). */
export function selfServiceCount(): number {
  return ESTATE_TASKS.filter((t) => t.doer === "you").length;
}

const DISCLAIMER =
  "This is a practical preparation checklist, not legal advice. Most of these steps are yours to do and don't require a lawyer — they're what make a legal plan actually work. When a step needs documents drafted or recorded, an attorney reviews them before you sign.";

export function estateChecklistDisclaimer(): string {
  return DISCLAIMER;
}
