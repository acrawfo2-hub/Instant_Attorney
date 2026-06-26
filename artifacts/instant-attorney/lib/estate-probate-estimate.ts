// ── Probate cost vs. trust estimator ─────────────────────────────────────────
//
// Puts real (rough) Texas dollars on the trade-off the trust planner describes:
// what a will-based estate costs to settle through probate, versus a will plus
// the cheap non-probate tools (transfer-on-death deed + beneficiary forms),
// versus a revocable-trust plan that skips probate. The point is honesty, not a
// sales pitch — for a simple single estate the tools path is often cheapest,
// while a married couple (two probates) or out-of-state real estate (a second,
// ancillary probate) is where a trust tends to pay for itself.
//
// All figures are PLANNING ESTIMATES, expressed as ranges, based on typical
// Texas independent-administration probate costs (commonly a few thousand to
// ~$8,500 per proceeding) and typical attorney package pricing. They are not a
// quote and not statutory values; a consult prices a real situation.
//
// Pure compute, fully testable. General information, not legal advice.

export type EstateSize = "modest" | "moderate" | "substantial";

export interface EstateProfile {
  /** Married — drives a second probate at the second death on the will paths. */
  married: boolean;
  /** Owns a home or other Texas real estate. */
  ownsHome: boolean;
  /** Owns real estate in another state — triggers a separate ancillary probate. */
  outOfStateRealEstate: boolean;
  /** Rough estate size: modest (<~$250k), moderate (~$250k–$1M), substantial (>~$1M). */
  estateSize: EstateSize;
  /** Willing to use the cheap non-probate tools (TOD deed + POD/beneficiary forms). */
  useNonProbateTools: boolean;
}

export interface CostRange {
  low: number;
  high: number;
}

export type PathKey = "will_only" | "will_plus_tools" | "trust_based";

export interface PathEstimate {
  key: PathKey;
  label: string;
  /** What you pay now to set it up. */
  upfront: CostRange;
  /** What it costs to settle later (probate / trust administration). */
  atDeath: CostRange;
  /** upfront + atDeath. */
  total: CostRange;
  /** Expected number of probate proceedings (domestic + ancillary). */
  probateProceedings: number;
  avoidsProbate: boolean;
  privacy: boolean;
  /** Seamless management on incapacity (a trust) vs. a power of attorney only. */
  incapacityCoverage: boolean;
  /** Rough settlement time, in months. */
  settlementMonths: CostRange;
  notes: string[];
}

export interface EstateComparison {
  paths: PathEstimate[];
  cheapestTotalKey: PathKey;
  verdict: string;
}

// ── Cost model (Texas planning estimates) ────────────────────────────────────
const WILL_PACKAGE: Record<"single" | "couple", CostRange> = {
  single: { low: 500, high: 1500 },
  couple: { low: 800, high: 2200 },
};
const TRUST_PACKAGE: Record<"single" | "couple", CostRange> = {
  single: { low: 1500, high: 3000 },
  couple: { low: 2500, high: 4500 },
};
// TOD deed preparation + recording; beneficiary/POD forms are free.
const TOOLS_ADDON: CostRange = { low: 200, high: 700 };
// Retitling assets / recording deeds to FUND a trust.
const FUNDING_ADDON: CostRange = { low: 200, high: 900 };
// Cost of one Texas probate proceeding (independent administration), by size.
const PROBATE_PER_PROCEEDING: Record<EstateSize, CostRange> = {
  modest: { low: 2000, high: 4000 },
  moderate: { low: 3000, high: 6000 },
  substantial: { low: 4500, high: 9000 },
};
// A separate out-of-state (ancillary) probate, per proceeding.
const ANCILLARY_PROBATE: CostRange = { low: 2500, high: 6000 };
// Residual settlement when probate is largely avoided (small affidavit/muniment,
// or successor-trustee administration of a trust), per death.
const RESIDUAL_SETTLEMENT: CostRange = { low: 0, high: 1500 };

const add = (a: CostRange, b: CostRange): CostRange => ({ low: a.low + b.low, high: a.high + b.high });
const scale = (a: CostRange, n: number): CostRange => ({ low: a.low * n, high: a.high * n });
const round100 = (a: CostRange): CostRange => ({
  low: Math.round(a.low / 100) * 100,
  high: Math.round(a.high / 100) * 100,
});
const mid = (a: CostRange): number => (a.low + a.high) / 2;

export function estimateProbateVsTrust(profile: EstateProfile): EstateComparison {
  const couple = profile.married;
  const deaths = couple ? 2 : 1;
  const ancillaryProceedings = profile.outOfStateRealEstate ? deaths : 0;
  const size = profile.estateSize;
  const pkgKey = couple ? "couple" : "single";

  // ── Will only: full probate at each death, plus any ancillary probate. ──
  const willOnlyUpfront = WILL_PACKAGE[pkgKey];
  const willOnlyAtDeath = add(
    scale(PROBATE_PER_PROCEEDING[size], deaths),
    scale(ANCILLARY_PROBATE, ancillaryProceedings)
  );
  const willOnly: PathEstimate = {
    key: "will_only",
    label: "Will only",
    upfront: round100(willOnlyUpfront),
    atDeath: round100(willOnlyAtDeath),
    total: round100(add(willOnlyUpfront, willOnlyAtDeath)),
    probateProceedings: deaths + ancillaryProceedings,
    avoidsProbate: false,
    privacy: false,
    incapacityCoverage: false,
    settlementMonths: { low: 6, high: 12 },
    notes: [
      "A will organizes and cheapens probate but does not avoid it — the estate still goes through court.",
      couple ? "A married couple usually probates twice — once at each death." : "One probate proceeding at death.",
      ...(ancillaryProceedings > 0 ? ["Out-of-state real estate adds a separate ancillary probate in that state."] : []),
    ],
  };

  // ── Will + non-probate tools: TOD deed + POD/beneficiary forms route most ──
  // assets around probate cheaply. Out-of-state real estate may still need an
  // ancillary probate (tools don't reliably reach it — a trust does).
  const toolsUpfront = add(WILL_PACKAGE[pkgKey], TOOLS_ADDON);
  const toolsAtDeath = add(scale(RESIDUAL_SETTLEMENT, deaths), scale(ANCILLARY_PROBATE, ancillaryProceedings));
  const willPlusTools: PathEstimate = {
    key: "will_plus_tools",
    label: "Will + transfer-on-death deed & beneficiary forms",
    upfront: round100(toolsUpfront),
    atDeath: round100(toolsAtDeath),
    total: round100(add(toolsUpfront, toolsAtDeath)),
    probateProceedings: ancillaryProceedings,
    avoidsProbate: ancillaryProceedings === 0,
    privacy: ancillaryProceedings === 0,
    incapacityCoverage: false,
    settlementMonths: ancillaryProceedings === 0 ? { low: 0, high: 2 } : { low: 4, high: 10 },
    notes: [
      "A transfer-on-death deed passes the home outside probate; POD/beneficiary forms route accounts directly — both free or nearly so.",
      "Keeps your estate largely out of the public probate record without a trust.",
      ...(ancillaryProceedings > 0
        ? ["Out-of-state real estate is the gap: these tools may not reach it, so an ancillary probate can remain — a trust would avoid it."]
        : ["Works best when nearly everything you own can take a beneficiary or TOD designation."]),
      "Incapacity is covered only by a power of attorney, which some institutions resist.",
    ],
  };

  // ── Trust-based: avoids probate entirely (incl. ancillary), private, and ──
  // manages assets on incapacity — for a higher upfront cost that must be funded.
  const trustUpfront = add(TRUST_PACKAGE[pkgKey], FUNDING_ADDON);
  const trustAtDeath = scale(RESIDUAL_SETTLEMENT, deaths);
  const trustBased: PathEstimate = {
    key: "trust_based",
    label: "Revocable living trust (+ pour-over will)",
    upfront: round100(trustUpfront),
    atDeath: round100(trustAtDeath),
    total: round100(add(trustUpfront, trustAtDeath)),
    probateProceedings: 0,
    avoidsProbate: true,
    privacy: true,
    incapacityCoverage: true,
    settlementMonths: { low: 1, high: 4 },
    notes: [
      "Avoids probate entirely — including a married couple's second probate and any out-of-state ancillary probate.",
      "Private (no public probate record) and manages your assets seamlessly if you're incapacitated, without a court.",
      "Costs more upfront, and only works for assets you actually retitle into it — funding is the step people skip.",
    ],
  };

  const paths = [willOnly, willPlusTools, trustBased];
  const cheapestTotalKey = paths.reduce((best, p) => (mid(p.total) < mid(best.total) ? p : best)).key;

  return { paths, cheapestTotalKey, verdict: buildVerdict(profile, willPlusTools, trustBased) };
}

function buildVerdict(profile: EstateProfile, tools: PathEstimate, trust: PathEstimate): string {
  const extra = Math.max(0, Math.round((mid(trust.total) - mid(tools.total)) / 100) * 100);
  if (profile.outOfStateRealEstate) {
    return "With real estate in another state, a trust usually comes out ahead — it avoids a second, out-of-state probate that a will (even with a transfer-on-death deed) generally can't reach. The extra upfront cost often pays for itself, and you also get privacy and incapacity coverage.";
  }
  if (mid(trust.total) <= mid(tools.total)) {
    return "Over the whole arc, a trust is roughly cost-competitive here — and it adds privacy and seamless incapacity management. For your situation it's a reasonable choice, not an upsell.";
  }
  return `You can likely get the probate avoidance you want for less with a will plus a transfer-on-death deed and beneficiary designations — roughly $${extra.toLocaleString()} less upfront than a trust by the midpoint estimate. A trust still buys privacy and hands-on incapacity coverage; whether that's worth the extra is a personal call. These are estimates — a consult can price your actual situation.`;
}

const DISCLAIMER =
  "These are rough planning estimates expressed as ranges, not a quote, and not legal advice. Actual costs vary with your assets, county, attorney, and whether anything is contested. They assume ordinary Texas independent-administration probate; a contested estate costs far more. A consult can price your real situation.";

export function estateProbateDisclaimer(): string {
  return DISCLAIMER;
}
