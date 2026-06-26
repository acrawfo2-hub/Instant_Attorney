// ── Defamation statutory & doctrinal registry ────────────────────────────────
//
// Defamation has exploded with social media, but the cases are usually low-dollar,
// so most go unrepresented — this app is the stopgap. The two things that most
// often sink a regular person are invisible to them: the ONE-YEAR deadline and the
// Texas anti-SLAPP (TCPA) fee-shifting trap, where suing over public-concern speech
// can make YOU pay the other side's attorney's fees. This registry grounds intake
// and drafting on the real rules (Texas-focused, with the governing constitutional
// doctrine and federal § 230 platform immunity).
//
// Mirrors lib/debt-statutes.ts: every entry cites an official .gov source. The
// model is constrained to these `key`s and must not invent a citation. General
// legal information, not legal advice.

export type DefamationCategory =
  | "elements"
  | "limitations"
  | "mitigation"
  | "anti-slapp"
  | "platform-immunity"
  | "constitutional"
  | "defenses";

export interface DefamationStatute {
  key: string;
  code: string;
  category: DefamationCategory;
  jurisdiction: "Federal" | "Texas";
  topic: string;
  summary: string;
  /** What it means for the person, in plain language. */
  plain_point: string;
  /** A deadline or timing rule to watch, or null. */
  deadline: string | null;
  official_url: string;
  triggers: string[];
}

const TX_CP_73 = "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.73.htm";
const TX_CP_27 = "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.27.htm";
const TX_CP_16 = "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.16.htm";
const US_CONGRESS_230 = "https://www.govinfo.gov/app/details/USCODE-2022-title47/USCODE-2022-title47-chap5-subchapII-partI-sec230";

export const DEFAMATION_STATUTES: DefamationStatute[] = [
  {
    key: "tx-libel-elements",
    code: "Tex. Civ. Prac. & Rem. Code Ch. 73",
    category: "elements",
    jurisdiction: "Texas",
    topic: "What counts as defamation (libel / slander)",
    summary:
      "Defamation is a false statement of fact, published to a third party, that is about the plaintiff and causes reputational harm — written (libel) or spoken (slander). A statement of pure opinion, and a true statement, are not defamatory. Some statements are defamation 'per se' (see the per-se entry), where harm is presumed.",
    plain_point:
      "To be defamation it has to be a false statement of FACT (not opinion), said to someone else, that's about you and hurts your reputation. Truth and pure opinion are complete defenses.",
    deadline: null,
    official_url: TX_CP_73,
    triggers: ["defamation", "libel", "slander", "lied about me", "false statement", "ruined my reputation", "said something untrue"],
  },
  {
    key: "tx-defamation-per-se",
    code: "Tex. Civ. Prac. & Rem. Code Ch. 73 (per se categories)",
    category: "elements",
    jurisdiction: "Texas",
    topic: "Defamation per se — when harm is presumed",
    summary:
      "Certain false statements are defamatory 'per se,' so damages are presumed without specific proof of loss: falsely accusing someone of a crime, of having a loathsome disease, of misconduct in their job, business, or profession, or of sexual misconduct. Other statements ('per quod') require proof of actual damages.",
    plain_point:
      "If the lie falsely accuses you of a crime, a serious disease, professional misconduct, or sexual misconduct, harm is presumed — you don't have to prove a dollar figure to have a case.",
    deadline: null,
    official_url: TX_CP_73,
    triggers: ["accused me of a crime", "said I'm a criminal", "professional misconduct", "accused me of cheating", "per se", "damaged my career"],
  },
  {
    key: "tx-defamation-limitations",
    code: "Tex. Civ. Prac. & Rem. Code § 16.002",
    category: "limitations",
    jurisdiction: "Texas",
    topic: "One-year statute of limitations",
    summary:
      "A defamation suit must be brought within ONE YEAR of when the statement was published. This is shorter than most deadlines and is the single most common way a valid claim is lost.",
    plain_point:
      "You have only one year from when it was posted or said to sue. Don't wait — this deadline is short and unforgiving.",
    deadline: "Sue within one year of publication.",
    official_url: TX_CP_16,
    triggers: ["how long do I have", "deadline", "statute of limitations", "too late", "a year ago", "last year"],
  },
  {
    key: "tx-defamation-mitigation-act",
    code: "Tex. Civ. Prac. & Rem. Code Ch. 73, Subch. B (§§ 73.051–73.062)",
    category: "mitigation",
    jurisdiction: "Texas",
    topic: "Defamation Mitigation Act — request a correction/retraction",
    summary:
      "Before or during the limitations period, a person may make a timely, sufficient WRITTEN request that the publisher correct, clarify, or retract the statement. A timely retraction can limit the damages available, and making a proper request is a prerequisite to recovering exemplary (punitive) damages.",
    plain_point:
      "Sending a proper written retraction request is often the smartest first move — it can get the lie taken down, and it's usually required before you can ask for punitive damages.",
    deadline: "Make the written request within the limitations period; earlier is better.",
    official_url: TX_CP_73,
    triggers: ["take it down", "retraction", "correction", "get them to delete", "make them fix it", "demand removal"],
  },
  {
    key: "tx-tcpa-anti-slapp",
    code: "Tex. Civ. Prac. & Rem. Code Ch. 27 (TCPA)",
    category: "anti-slapp",
    jurisdiction: "Texas",
    topic: "Anti-SLAPP (Texas Citizens Participation Act) — fee-shifting risk",
    summary:
      "If you sue over speech on a matter of public concern, the defendant can file a TCPA motion to dismiss early; if it succeeds, the court MUST award the defendant their attorney's fees and may sanction the plaintiff. It is designed to deter meritless suits that chill speech.",
    plain_point:
      "Big warning: if you sue over speech about a public issue and lose an early anti-SLAPP motion, YOU can be ordered to pay the other side's attorney's fees. Weigh this carefully before filing.",
    deadline: "A TCPA motion is typically filed within 60 days of service of the suit.",
    official_url: TX_CP_27,
    triggers: ["should I sue", "sue them", "anti-slapp", "public concern", "review website", "online review", "matter of public concern"],
  },
  {
    key: "us-section-230",
    code: "47 U.S.C. § 230",
    category: "platform-immunity",
    jurisdiction: "Federal",
    topic: "Platform immunity for third-party content",
    summary:
      "Online platforms (social media, review sites, forums) are generally immune from liability for content posted by their users. The remedy usually runs against the person who posted the statement, not the website — and if the poster is anonymous, identifying them may require a subpoena.",
    plain_point:
      "You usually can't sue Facebook, Google, or a review site for what a user posted — you go after the person who posted it. If they're anonymous, unmasking them takes a legal step.",
    deadline: null,
    official_url: US_CONGRESS_230,
    triggers: ["sue facebook", "sue google", "sue the website", "anonymous", "fake account", "don't know who posted", "review site"],
  },
  {
    key: "actual-malice-public-figure",
    code: "U.S. Const. amend. I (NYT v. Sullivan line of cases)",
    category: "constitutional",
    jurisdiction: "Federal",
    topic: "The 'actual malice' standard for public figures",
    summary:
      "A public official or public figure must prove the statement was made with 'actual malice' — knowledge that it was false or reckless disregard for the truth. Private individuals generally need only prove the speaker was negligent about the truth, which is a much lower bar.",
    plain_point:
      "If you're a public figure, the law makes you prove the speaker KNEW it was false or recklessly ignored the truth — a hard standard. Private people have a much easier road.",
    deadline: null,
    official_url: "https://www.uscourts.gov/about-federal-courts/educational-resources/about-educational-outreach/activity-resources/facts-and-case-summary-new-york-times-v-sullivan",
    triggers: ["public figure", "public official", "i'm well known", "celebrity", "actual malice", "elected"],
  },
  {
    key: "defamation-defenses",
    code: "Tex. Civ. Prac. & Rem. Code Ch. 73 (truth, opinion, privilege)",
    category: "defenses",
    jurisdiction: "Texas",
    topic: "Core defenses — truth, opinion, and privilege",
    summary:
      "Truth (substantial truth) is a complete defense. A statement of pure opinion that can't be proven true or false is protected. Certain communications are privileged (e.g., fair reporting of official proceedings, statements in court). These defenses defeat many claims, so assess them honestly before acting.",
    plain_point:
      "If the statement is substantially true, is genuine opinion, or is legally privileged, there's likely no claim — be honest with yourself about this before spending time or money.",
    deadline: null,
    official_url: TX_CP_73,
    triggers: ["is it defamation if it's true", "just their opinion", "privilege", "defense", "but it's true"],
  },
];

export type DefamationStatuteKey = (typeof DEFAMATION_STATUTES)[number]["key"];

const BY_KEY = new Map(DEFAMATION_STATUTES.map((s) => [s.key, s]));

export function getDefamationStatute(key: string): DefamationStatute | undefined {
  return BY_KEY.get(key);
}

export function isKnownDefamationStatuteKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact one-line-per-statute catalog for injection into a system prompt. */
export function defamationStatutesForPrompt(): string {
  return DEFAMATION_STATUTES.map(
    (s) =>
      `• ${s.key} — ${s.code} (${s.jurisdiction}): ${s.topic}. ${s.plain_point}${
        s.deadline ? ` (Deadline: ${s.deadline})` : ""
      }`
  ).join("\n");
}

/** Offline keyword fallback: surface statutes whose triggers appear in free text. */
export function matchDefamationStatutesByText(text: string): DefamationStatute[] {
  const haystack = text.toLowerCase();
  return DEFAMATION_STATUTES.filter((s) => s.triggers.some((t) => haystack.includes(t.toLowerCase())));
}
