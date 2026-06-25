// ── Estate-planning pathfinder ───────────────────────────────────────────────
//
// "Do I need a trust, or just a will?" For a middle-class Texas family this is
// the question the whole industry muddies. This module lays out the real
// instruments — a will-based plan, a revocable living trust, the cheap
// probate-avoidance tools (transfer-on-death deed, POD/beneficiary designations),
// incapacity documents, a guardian designation, and a special-needs trust — and
// ranks each against a few plain-English signals so the right plan floats up.
//
// The honest thesis, encoded in the ratings: because Texas has independent
// administration (cheap probate) and no state death tax, MOST middle-class
// estates are well served by a will plus a transfer-on-death deed and beneficiary
// designations. A revocable living trust earns "strong" only for the situations
// where it genuinely pays for itself — out-of-state real estate, a need for
// privacy, blended-family complexity, robust incapacity management, or a disabled
// beneficiary. We never push a trust someone doesn't need.
//
// Pure data + lookup, fully testable. General legal information, not legal advice.

import type { EstateStatuteKey } from "./estate-statutes.ts";

export type EstateInstrumentKey =
  | "will_based_plan"
  | "transfer_on_death_deed"
  | "beneficiary_designations"
  | "financial_power_of_attorney"
  | "medical_directives"
  | "guardian_designation"
  | "revocable_living_trust"
  | "special_needs_trust";

export type Fit = "essential" | "strong" | "consider" | "optional";

export interface EstateInstrument {
  key: EstateInstrumentKey;
  label: string;
  /** Roughly what it costs to set up, in plain terms. */
  costBand: string;
  summary: string;
  bestWhen: string[];
  watchOut: string[];
  relevant_statutes: EstateStatuteKey[];
}

export interface PlanSignals {
  /** Owns a home or other real estate. */
  ownsHome?: boolean;
  /** Has minor children. */
  minorChildren?: boolean;
  /** Blended family — children from a prior relationship, stepchildren, etc. */
  blendedFamily?: boolean;
  /** Owns real estate in another state (a second home, inherited land). */
  outOfStateRealEstate?: boolean;
  /** A beneficiary has a disability and may rely on means-tested benefits. */
  disabledBeneficiary?: boolean;
  /** Specifically wants the terms of their plan kept private (probate is public). */
  wantsPrivacy?: boolean;
  /** Wants someone able to manage assets for them if incapacitated, not just at death. */
  wantsIncapacityManagement?: boolean;
  /** Self-describes a larger / more complex estate (multiple properties, a business). */
  largerEstate?: boolean;
}

export interface RankedInstrument extends EstateInstrument {
  fit: Fit;
  reason: string;
}

const INSTRUMENTS: Record<EstateInstrumentKey, EstateInstrument> = {
  will_based_plan: {
    key: "will_based_plan",
    label: "Will with independent administration",
    costBand: "Low — the foundation of almost every plan",
    summary:
      "A will that names who inherits, names your executor, asks for independent administration, and (for parents) names a guardian for your children. Thanks to Texas independent administration, a will-based estate usually clears probate quickly and cheaply — which is why, for most middle-class families, a solid will is the backbone, not a starter step toward a trust.",
    bestWhen: [
      "You want a clear, low-cost plan that says who gets what and who's in charge.",
      "You have minor children and need to name a guardian (a will is where you do it).",
      "Your estate is mostly a home and ordinary accounts in Texas.",
    ],
    watchOut: [
      "A will still goes through probate — in Texas usually inexpensive, but public.",
      "It only controls assets that don't already pass by deed or beneficiary form.",
      "Must be signed with the right formalities (witnesses or a valid holographic will).",
    ],
    relevant_statutes: ["tx-independent-administration", "tx-muniment-of-title", "tx-intestate-succession"],
  },
  transfer_on_death_deed: {
    key: "transfer_on_death_deed",
    label: "Transfer-on-death deed (for your home)",
    costBand: "Very low — one recorded deed",
    summary:
      "A recorded deed that passes your home to a named beneficiary at death, outside probate, while you keep full control and the right to revoke. For a Texas homeowner this is the cheapest, highest-impact way to keep the family's biggest asset out of probate — often doing the job people think requires a trust.",
    bestWhen: [
      "You own a home in Texas and want it to skip probate.",
      "You want a simple, revocable, low-cost alternative to a living trust for real estate.",
    ],
    watchOut: [
      "Must be signed, notarized, and RECORDED before death — an unrecorded deed does nothing.",
      "It passes the home as-is, including any mortgage or liens.",
      "Coordinate it with your will so they don't contradict each other.",
    ],
    relevant_statutes: ["tx-transfer-on-death-deed"],
  },
  beneficiary_designations: {
    key: "beneficiary_designations",
    label: "Beneficiary & POD designations",
    costBand: "Free — forms at your bank/brokerage/employer",
    summary:
      "Retirement accounts, life insurance, and bank/brokerage accounts pass directly to the people you name on their beneficiary or payable-on-death forms — outside probate and regardless of your will. Keeping these current is the most overlooked, highest-leverage move in estate planning, and it's free.",
    bestWhen: [
      "You have retirement accounts, life insurance, or bank/investment accounts (almost everyone).",
      "You want assets to reach people quickly without probate.",
    ],
    watchOut: [
      "These OVERRIDE your will — a stale ex-spouse on a 401(k) inherits it no matter what your will says.",
      "Naming a minor or a disabled person directly can cause problems (consider a trust instead).",
      "Review after every marriage, divorce, birth, or death.",
    ],
    relevant_statutes: ["tx-payable-on-death-accounts", "tx-community-property-survivorship"],
  },
  financial_power_of_attorney: {
    key: "financial_power_of_attorney",
    label: "Durable (financial) power of attorney",
    costBand: "Low — a core incapacity document",
    summary:
      "Names someone to manage your finances if you can't. Without it, your family may need an expensive court guardianship just to pay your bills. This protects you while you're alive — something a will does nothing about.",
    bestWhen: [
      "Every adult — incapacity can happen at any age.",
      "You want to avoid a court guardianship if you're ever unable to manage money.",
    ],
    watchOut: [
      "Must be signed while you still have capacity.",
      "Choose your agent carefully — it's a powerful authority.",
    ],
    relevant_statutes: ["tx-statutory-durable-poa"],
  },
  medical_directives: {
    key: "medical_directives",
    label: "Medical power of attorney & living will",
    costBand: "Low — core incapacity documents",
    summary:
      "A medical power of attorney names who makes health decisions for you, and a directive to physicians (living will) records your end-of-life wishes. Together they spare your family from guessing or fighting during a crisis.",
    bestWhen: [
      "Every adult — these matter long before any inheritance does.",
      "You want your medical wishes followed and your family relieved of impossible choices.",
    ],
    watchOut: [
      "Sign while you have capacity; give copies to your agent and doctors.",
      "Keep them accessible — a document no one can find won't help in an ER.",
    ],
    relevant_statutes: ["tx-medical-power-of-attorney", "tx-directive-to-physicians"],
  },
  guardian_designation: {
    key: "guardian_designation",
    label: "Guardian designation for your children",
    costBand: "Low — usually part of your will",
    summary:
      "Names who would raise your minor children if you couldn't. For young parents this is often the single most important reason to make a plan — far more than any tax or probate concern.",
    bestWhen: [
      "You have minor children.",
      "You want to choose your kids' guardian rather than leave it to a court.",
    ],
    watchOut: [
      "Talk to the people you name first.",
      "Pair it with a way to hold the children's inheritance (a testamentary or living trust) so a young child doesn't receive a lump sum at 18.",
    ],
    relevant_statutes: ["tx-declaration-of-guardian", "tx-testamentary-trust"],
  },
  revocable_living_trust: {
    key: "revocable_living_trust",
    label: "Revocable living trust",
    costBand: "Higher — costs more to draft AND must be funded",
    summary:
      "A trust you control during life that owns assets you retitle into it, so they avoid probate and can be managed privately if you're incapacitated. It's a genuinely useful tool — but in Texas, with cheap independent-administration probate, it's usually NOT necessary for a straightforward estate. It earns its cost for specific situations: real estate in another state, a real need for privacy, blended-family complexity, or hands-on incapacity management.",
    bestWhen: [
      "You own real estate in another state (a trust avoids a second, out-of-state probate).",
      "You genuinely want privacy — a trust keeps your plan out of the public probate record.",
      "You want seamless management of assets if you're incapacitated, beyond a power of attorney.",
      "A blended family or complex wishes need tighter control than a simple will provides.",
    ],
    watchOut: [
      "It ONLY works for assets you actually retitle into it — an unfunded trust does nothing.",
      "It costs more upfront than a will, and you still need a will (a 'pour-over') and POAs.",
      "It does NOT save Texas death taxes (there are none) or, by itself, protect assets from your own creditors.",
    ],
    relevant_statutes: ["tx-revocable-living-trust"],
  },
  special_needs_trust: {
    key: "special_needs_trust",
    label: "Special (supplemental) needs trust",
    costBand: "Specialized — worth it to protect benefits",
    summary:
      "Holds an inheritance for a loved one with a disability so it supplements, rather than destroys, their means-tested benefits like SSI and Medicaid. Leaving money to them outright can disqualify them; this protects both the money and the benefits.",
    bestWhen: [
      "A child or beneficiary has a disability and relies on (or may need) public benefits.",
      "You want to provide for them without cutting off that support.",
    ],
    watchOut: [
      "Must be drafted correctly to preserve eligibility — this is not a DIY document.",
      "Never name a disabled beneficiary directly on a will or beneficiary form instead.",
    ],
    relevant_statutes: ["tx-special-needs-trust"],
  },
};

const FIT_ORDER: Record<Fit, number> = { essential: 0, strong: 1, consider: 2, optional: 3 };

// Canonical order favors the cheap, broadly-useful foundation first and the
// higher-cost trust later — so the default plan reads "will + the simple tools."
const CANONICAL: EstateInstrumentKey[] = [
  "will_based_plan",
  "financial_power_of_attorney",
  "medical_directives",
  "beneficiary_designations",
  "transfer_on_death_deed",
  "guardian_designation",
  "revocable_living_trust",
  "special_needs_trust",
];

function rate(key: EstateInstrumentKey, s: PlanSignals): { fit: Fit; reason: string } {
  switch (key) {
    // Core documents everyone should have — independent of the answers.
    case "will_based_plan":
      return { fit: "essential", reason: "A will is the low-cost backbone of nearly every Texas plan." };
    case "financial_power_of_attorney":
      return { fit: "essential", reason: "Protects you during life and helps your family avoid guardianship." };
    case "medical_directives":
      return { fit: "essential", reason: "Every adult needs someone empowered to make medical decisions." };

    case "beneficiary_designations":
      return { fit: "strong", reason: "Free, and it routes accounts straight to your people outside probate — keep it current." };

    case "transfer_on_death_deed":
      if (s.ownsHome === true)
        return { fit: "strong", reason: "You own a home — this keeps it out of probate cheaply, often instead of a trust." };
      if (s.ownsHome === false)
        return { fit: "optional", reason: "Most useful once you own real estate." };
      return { fit: "consider", reason: "The cheapest way to keep a home out of probate if you own one." };

    case "guardian_designation":
      if (s.minorChildren === true)
        return { fit: "essential", reason: "With minor children, naming a guardian is the most important thing you'll do." };
      if (s.minorChildren === false)
        return { fit: "optional", reason: "Relevant if you have or expect minor children." };
      return { fit: "consider", reason: "Essential the moment minor children are in the picture." };

    case "special_needs_trust":
      if (s.disabledBeneficiary === true)
        return { fit: "essential", reason: "Protects a disabled loved one's benefits — don't leave assets to them directly." };
      return { fit: "optional", reason: "Only needed if a beneficiary relies on means-tested benefits." };

    case "revocable_living_trust": {
      // The honest core: a trust is "strong" only when it genuinely pays off.
      const payoffs =
        Number(!!s.outOfStateRealEstate) +
        Number(!!s.wantsPrivacy) +
        Number(!!s.wantsIncapacityManagement) +
        Number(!!s.blendedFamily) +
        Number(!!s.largerEstate);
      if (s.outOfStateRealEstate)
        return { fit: "strong", reason: "Out-of-state real estate is the classic case — a trust avoids a second probate there." };
      if (payoffs >= 2)
        return { fit: "strong", reason: "Your situation (privacy, incapacity, or complexity) is where a trust earns its cost." };
      if (payoffs === 1)
        return { fit: "consider", reason: "Could help, but in Texas a will plus the simple tools often does the same job for less." };
      return { fit: "optional", reason: "In Texas, with cheap probate and no death tax, most simple estates don't need one." };
    }
  }
}

export function getEstateInstrument(key: EstateInstrumentKey): EstateInstrument {
  return INSTRUMENTS[key];
}

/** All instruments in canonical order (no ranking). */
export const ESTATE_INSTRUMENTS: EstateInstrument[] = CANONICAL.map((k) => INSTRUMENTS[k]);

/**
 * Rank the instruments for a person's situation. Essential first, then strong,
 * consider, optional; canonical order within each tier. Deterministic.
 */
export function recommendEstatePlan(signals: PlanSignals = {}): RankedInstrument[] {
  return CANONICAL.map((key) => {
    const { fit, reason } = rate(key, signals);
    return { ...INSTRUMENTS[key], fit, reason };
  }).sort((a, b) => {
    const byFit = FIT_ORDER[a.fit] - FIT_ORDER[b.fit];
    if (byFit !== 0) return byFit;
    return CANONICAL.indexOf(a.key) - CANONICAL.indexOf(b.key);
  });
}

/**
 * A one-line verdict on the trust question, tuned to the signals — the headline
 * answer the middle-class user actually came for.
 */
export function trustVerdict(signals: PlanSignals = {}): string {
  const t = recommendEstatePlan(signals).find((i) => i.key === "revocable_living_trust")!;
  if (t.fit === "strong") {
    return "A revocable living trust looks worth it for your situation — see why below.";
  }
  if (t.fit === "consider") {
    return "A trust is worth weighing, but in Texas a will plus a few simple tools may get you the same result for far less.";
  }
  return "Good news: most Texas estates like yours don't need an expensive trust — a will plus a transfer-on-death deed and beneficiary forms usually does the job.";
}

const DISCLAIMER =
  "This is general legal information to help you understand your options, not legal advice or a recommendation. The right plan depends on your full family and financial picture and on documents being signed and funded correctly. Texas has independent administration (low-cost probate) and no state death tax, so for most middle-class families the goal is a smooth, inexpensive transfer — not tax avoidance. A consult can confirm the right plan for you.";

export function estatePlanDisclaimer(): string {
  return DISCLAIMER;
}
