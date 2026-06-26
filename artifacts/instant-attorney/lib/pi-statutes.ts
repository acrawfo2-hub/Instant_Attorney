// ── Personal injury statutory registry ───────────────────────────────────────
//
// Source-cited catalog of the Texas laws that decide most personal-injury
// matters — the two-year limitations period, modified comparative negligence,
// medical-malpractice caps and repose, auto-liability minimums, wrongful-death
// standing, and exemplary-damages limits. Mirrors lib/family-statutes.ts and
// lib/debt-statutes.ts: every entry cites an official .gov source so intake
// and drafting GROUND on a real right instead of paraphrasing one. The model
// is constrained to these `key`s and must not invent a citation.
//
// General legal information, not legal advice. Summaries are high-level; the
// linked official text governs.

export type PiCategory =
  | "limitations"
  | "negligence"
  | "damages"
  | "insurance"
  | "med-mal"
  | "wrongful-death"
  | "evidence";

export interface PiStatute {
  key: string;
  /** Formal citation, e.g. "Tex. Civ. Prac. & Rem. Code § 16.003". */
  code: string;
  category: PiCategory;
  /** "Federal" or "Texas". */
  jurisdiction: "Federal" | "Texas";
  topic: string;
  summary: string;
  /** What the injured person can rely on, in plain language. */
  claimant_right: string;
  /** A deadline or timing rule the claimant should watch, or null. */
  deadline: string | null;
  official_url: string;
  triggers: string[];
}

const TX_CP_16 = "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.16.htm";
const TX_CP_33 = "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.33.htm";
const TX_CP_41 = "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.41.htm";
const TX_CP_71 = "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.71.htm";
const TX_CP_74 = "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.74.htm";
const TX_INS_1952 = "https://statutes.capitol.texas.gov/Docs/IN/htm/IN.1952.htm";

export const PI_STATUTES: PiStatute[] = [
  {
    key: "tx-pi-sol-general",
    code: "Tex. Civ. Prac. & Rem. Code § 16.003",
    category: "limitations",
    jurisdiction: "Texas",
    topic: "Two-year limitations period for bodily injury and wrongful death",
    summary:
      "A suit for personal injury or wrongful death must generally be filed within two years of the day the cause of action accrues — usually the date of the injury or death. Missing this deadline typically bars the claim entirely.",
    claimant_right:
      "You generally have two years from the injury (or death) to file a lawsuit. The clock is running — treat the deadline as real even while you are still treating or negotiating with an insurer.",
    deadline: "Generally two years from the date of injury or death.",
    official_url: TX_CP_16,
    triggers: [
      "statute of limitations",
      "how long do I have",
      "too late to sue",
      "two year",
      "2 year",
      "deadline to file",
      "time limit",
    ],
  },
  {
    key: "tx-pi-sol-discovery",
    code: "Tex. Civ. Prac. & Rem. Code § 16.008",
    category: "limitations",
    jurisdiction: "Texas",
    topic: "Discovery rule for certain fraud and fiduciary claims",
    summary:
      "For a narrow set of claims (fraud, breach of fiduciary duty, and similar), the limitations period may not begin until the claimant discovers (or should have discovered) the wrongful act. This is NOT the general rule for ordinary negligence — do not assume it applies to a typical car wreck or slip-and-fall.",
    claimant_right:
      "In limited situations involving fraud or hidden wrongdoing, the clock may start when you discover the problem — but for a typical accident claim, accrual is usually the injury date.",
    deadline: "Varies by claim type; discovery rule applies only to specified causes of action.",
    official_url: TX_CP_16,
    triggers: ["discovery rule", "didn't know", "hidden injury", "found out later", "fraud"],
  },
  {
    key: "tx-pi-comparative-negligence",
    code: "Tex. Civ. Prac. & Rem. Code § 33.001",
    category: "negligence",
    jurisdiction: "Texas",
    topic: "Modified comparative negligence — bar at greater than 50% fault",
    summary:
      "Texas uses modified comparative negligence: a claimant may not recover damages if their percentage of responsibility is greater than 50%. At 50% or less, recovery is reduced by the claimant's share of fault.",
    claimant_right:
      "You can still recover if you are 50% or less at fault — but your damages are reduced by your percentage. If an insurer says you were mostly at fault, that is a reason to get your own analysis, not a reason to give up automatically.",
    deadline: null,
    official_url: TX_CP_33,
    triggers: [
      "partially at fault",
      "comparative negligence",
      "shared fault",
      "they say it was my fault",
      "contributory negligence",
      "percent at fault",
    ],
  },
  {
    key: "tx-pi-responsibility-allocation",
    code: "Tex. Civ. Prac. & Rem. Code § 33.003",
    category: "negligence",
    jurisdiction: "Texas",
    topic: "Jury allocates responsibility among all parties",
    summary:
      "In a trial, the trier of fact assigns a percentage of responsibility to each person whose conduct contributed to the harm, including the claimant. Each defendant pays only its proportionate share (with limited exceptions for certain intentional torts and joint tortfeasors).",
    claimant_right:
      "Fault is apportioned among everyone who contributed — including you. Knowing how Texas splits responsibility helps you evaluate settlement offers and trial risk.",
    deadline: null,
    official_url: TX_CP_33,
    triggers: ["multiple defendants", "who is at fault", "apportion fault", "several parties"],
  },
  {
    key: "tx-pi-exemplary-damages",
    code: "Tex. Civ. Prac. & Rem. Code Ch. 41",
    category: "damages",
    jurisdiction: "Texas",
    topic: "Caps and standards for exemplary (punitive) damages",
    summary:
      "Exemplary damages require clear and convincing evidence of fraud, malice, or gross negligence. They are capped at the greater of (1) two times economic damages plus non-economic damages up to $750,000, or (2) $200,000 — with a higher formula for certain intentional-conduct cases.",
    claimant_right:
      "Punitive damages are rare and capped. Most PI recoveries are compensatory — medical bills, lost wages, pain and suffering — not punitive.",
    deadline: null,
    official_url: TX_CP_41,
    triggers: ["punitive damages", "exemplary damages", "gross negligence", "punitive"],
  },
  {
    key: "tx-med-mal-sol",
    code: "Tex. Civ. Prac. & Rem. Code § 74.251",
    category: "med-mal",
    jurisdiction: "Texas",
    topic: "Medical-malpractice limitations and statute of repose",
    summary:
      "A health-care liability claim must generally be filed within two years of the malpractice or of the end of the treatment giving rise to the claim — but never more than ten years from the act (the statute of repose), even if the injury is discovered later.",
    claimant_right:
      "Medical-malpractice claims have a two-year filing window tied to treatment, plus a hard ten-year outer limit. Malpractice timing is fact-specific — do not guess the deadline from a general accident date.",
    deadline:
      "Generally two years from malpractice or end of treatment; absolute ten-year repose from the act.",
    official_url: TX_CP_74,
    triggers: [
      "medical malpractice",
      "doctor mistake",
      "surgical error",
      "hospital negligence",
      "misdiagnosis",
      "med mal",
    ],
  },
  {
    key: "tx-med-mal-cap",
    code: "Tex. Civ. Prac. & Rem. Code § 74.301",
    category: "med-mal",
    jurisdiction: "Texas",
    topic: "Cap on non-economic damages in medical-malpractice cases",
    summary:
      "In a health-care liability claim, non-economic damages (pain and suffering, etc.) are capped — generally $250,000 per defendant physician/hospital and an overall cap of $500,000 for all defendants, with adjusted figures for institutional defendants.",
    claimant_right:
      "Texas caps pain-and-suffering damages in medical-malpractice cases. Economic damages (medical bills, lost earnings) are not subject to this cap.",
    deadline: null,
    official_url: TX_CP_74,
    triggers: ["malpractice cap", "pain and suffering cap", "damage cap", "med mal damages"],
  },
  {
    key: "tx-auto-minimum-liability",
    code: "Tex. Ins. Code § 1952.051",
    category: "insurance",
    jurisdiction: "Texas",
    topic: "Minimum auto liability limits (30/60/25)",
    summary:
      "Texas requires minimum liability auto insurance of $30,000 per person / $60,000 per accident for bodily injury and $25,000 for property damage. Many at-fault drivers carry only the minimum — or none — which is why uninsured/underinsured motorist coverage matters.",
    claimant_right:
      "The at-fault driver's policy may be as low as $30,000 per person. If your damages exceed that, your own UM/UIM coverage (if you bought it) may be critical.",
    deadline: null,
    official_url: TX_INS_1952,
    triggers: [
      "minimum insurance",
      "30/60/25",
      "not enough insurance",
      "policy limits",
      "underinsured",
      "uninsured driver",
    ],
  },
  {
    key: "tx-pip-coverage",
    code: "Tex. Ins. Code Ch. 1952 (PIP)",
    category: "insurance",
    jurisdiction: "Texas",
    topic: "Personal Injury Protection (PIP) — no-fault medical/wage benefits",
    summary:
      "PIP is optional no-fault auto coverage that pays medical expenses and lost wages (and related benefits) for you and your passengers after a crash, regardless of fault, up to the policy limit. Insurers must offer it; you may reject it in writing.",
    claimant_right:
      "Your own auto policy may include PIP that pays your medical bills and lost wages without proving fault — check your declarations page.",
    deadline: "Notify your insurer and submit claims per your policy; do not delay treatment.",
    official_url: TX_INS_1952,
    triggers: ["pip", "personal injury protection", "med pay", "my own insurance", "no fault benefits"],
  },
  {
    key: "tx-wrongful-death",
    code: "Tex. Civ. Prac. & Rem. Code Ch. 71",
    category: "wrongful-death",
    jurisdiction: "Texas",
    topic: "Wrongful-death beneficiaries and recoverable damages",
    summary:
      "When an injury causes death, the surviving spouse, children, and parents may bring a wrongful-death action for their losses. A separate survival action may cover the decedent's pain and estate claims. The two-year limitations period applies.",
    claimant_right:
      "Certain close family members can bring a wrongful-death claim for their own losses when someone dies because of another's negligence — separate from the deceased person's estate claims.",
    deadline: "Generally two years from the date of death.",
    official_url: TX_CP_71,
    triggers: ["wrongful death", "died in the accident", "fatal crash", "lost my spouse", "lost my child"],
  },
  {
    key: "tx-premises-duty",
    code: "Tex. Civ. Prac. & Rem. Code § 75.002",
    category: "negligence",
    jurisdiction: "Texas",
    topic: "Landowner duty and recreational-use limits",
    summary:
      "A property owner's duty to protect visitors depends on why the person was on the property (invitee, licensee, trespasser). Texas also limits landowner liability for certain recreational use. Slip-and-fall and premises cases turn heavily on notice of the hazard and the visitor's status.",
    claimant_right:
      "Property owners owe different duties depending on why you were there and whether they knew (or should have known) about the dangerous condition.",
    deadline: null,
    official_url: "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.75.htm",
    triggers: [
      "slip and fall",
      "tripped",
      "premises liability",
      "store accident",
      "fell at",
      "dangerous condition",
      "wet floor",
    ],
  },
  {
    key: "tx-evidence-preservation",
    code: "Texas common law (spoliation)",
    category: "evidence",
    jurisdiction: "Texas",
    topic: "Duty to preserve evidence after a foreseeable claim",
    summary:
      "Once litigation is reasonably foreseeable, parties must preserve relevant evidence. Destroying or failing to preserve key evidence (surveillance video, vehicle data, texts) can lead to sanctions or adverse inference at trial. Sending a preservation letter early protects your record.",
    claimant_right:
      "Ask the other side — in writing — to preserve crash data, surveillance footage, vehicle black-box data, and internal communications before they are deleted.",
    deadline: "Send a preservation notice as soon as practicable after the incident.",
    official_url: "https://www.txcourts.gov/rules-forms/rules-standards/",
    triggers: [
      "surveillance video",
      "deleted footage",
      "black box",
      "spoliation",
      "preserve evidence",
      "they erased",
    ],
  },
];

export type PiStatuteKey = (typeof PI_STATUTES)[number]["key"];

const BY_KEY = new Map(PI_STATUTES.map((s) => [s.key, s]));

export function getPiStatute(key: string): PiStatute | undefined {
  return BY_KEY.get(key);
}

export function isKnownPiStatuteKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact one-line-per-statute catalog for injection into a system prompt. */
export function piStatutesForPrompt(): string {
  return PI_STATUTES.map(
    (s) =>
      `• ${s.key} — ${s.code} (${s.jurisdiction}): ${s.topic}. ${s.claimant_right}${
        s.deadline ? ` (Deadline: ${s.deadline})` : ""
      }`
  ).join("\n");
}

/** Offline keyword fallback: surface statutes whose triggers appear in free text. */
export function matchPiStatutesByText(text: string): PiStatute[] {
  const haystack = text.toLowerCase();
  return PI_STATUTES.filter((s) => s.triggers.some((t) => haystack.includes(t.toLowerCase())));
}
