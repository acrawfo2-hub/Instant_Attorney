// ── Texas comparative-fault impact calculator ──────────────────────────────────
//
// When an insurer says "you were partly at fault," clients need to see how
// Texas modified comparative negligence (§ 33.001) affects net recovery. Pure
// math — no I/O.
//
// General legal information, not legal advice.

export interface PiFaultInput {
  /** Total damages in dollars (medical + lost wages + pain/suffering, etc.). */
  totalDamages: number;
  /** Claimant's assigned fault percentage (0–100). */
  claimantFaultPct: number;
}

export interface PiFaultResult {
  totalDamages: number;
  claimantFaultPct: number;
  /** True when fault > 50% — no recovery under § 33.001. */
  barred: boolean;
  /** Recoverable amount after fault reduction (0 if barred). */
  netRecovery: number;
  reductionAmount: number;
  guidance: string;
  disclaimer: string;
}

const DISCLAIMER =
  "This applies Texas modified comparative negligence (§ 33.001) to a single damages figure — not legal advice. Fault percentages are decided by negotiation or a jury, and multiple defendants can complicate allocation.";

export function computePiFaultImpact(input: PiFaultInput): PiFaultResult {
  const totalDamages = Math.max(0, input.totalDamages);
  const claimantFaultPct = Math.min(100, Math.max(0, input.claimantFaultPct));

  const barred = claimantFaultPct > 50;
  const reductionAmount = barred ? totalDamages : totalDamages * (claimantFaultPct / 100);
  const netRecovery = barred ? 0 : totalDamages - reductionAmount;

  let guidance: string;
  if (barred) {
    guidance =
      "At more than 50% fault, Texas law bars recovery entirely. If an insurer assigns you majority fault, get an independent fault analysis — do not accept their percentage without evidence.";
  } else if (claimantFaultPct === 0) {
    guidance = "At zero fault, the full damages figure is theoretically recoverable (subject to policy limits, caps, and proof).";
  } else {
    guidance = `At ${claimantFaultPct}% fault, your net recovery is reduced proportionally. Insurers often inflate your fault to lower offers — compare their number to the evidence.`;
  }

  return {
    totalDamages,
    claimantFaultPct,
    barred,
    netRecovery,
    reductionAmount,
    guidance,
    disclaimer: DISCLAIMER,
  };
}

export const PI_FAULT_FACT_LABEL = "Comparative fault impact";

export function piFaultToFact(input: PiFaultInput, result: PiFaultResult): { label: string; value: string } {
  if (result.barred) {
    return {
      label: PI_FAULT_FACT_LABEL,
      value: `Total damages $${input.totalDamages.toLocaleString()} at ${input.claimantFaultPct}% fault — barred under Tex. Civ. Prac. & Rem. Code § 33.001 (>50%)`,
    };
  }
  return {
    label: PI_FAULT_FACT_LABEL,
    value: `Total damages $${input.totalDamages.toLocaleString()} at ${input.claimantFaultPct}% fault — est. net recovery $${Math.round(result.netRecovery).toLocaleString()}`,
  };
}
