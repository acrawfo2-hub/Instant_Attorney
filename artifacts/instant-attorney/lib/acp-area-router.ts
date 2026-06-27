// ── ACP intake practice-area router ──────────────────────────────────────────
//
// The ACP intake prompt used to carry all nine practice-area "deep dive"
// modules (~55K tokens) on every turn. Intake is exactly when the area is being
// discovered, so we can't rely on a pre-set practice-area field — instead we
// detect the area(s) the conversation implicates from the message text plus the
// durable case-file signals, and load only those modules. prompts.ts always
// includes a compact area index, so an unmatched turn still degrades gracefully:
// the model recognizes the area and asks the confirming question, and the full
// statutes load on the next turn once the signal is present.
//
// Pure data + functions so it is fully unit-testable.

import type { AcpArea } from "./prompts";
import type { CaseFile } from "./types";

/** Cap how many areas can load at once so a wide-ranging conversation can't drag
 *  in everything (which would defeat the routing). */
const MAX_AREAS = 3;

// Keyword signals per deep-dive area, matched against a lowercased haystack of
// the conversation + case file. Each regex that fires adds to the area's score;
// the highest-scoring areas (up to MAX_AREAS) load. Patterns are tuned to catch
// the practice-area openers and common lay phrasings while avoiding the obvious
// false positives (e.g. "will" as a verb is NOT an estate signal).
const AREA_SIGNALS: Record<AcpArea, RegExp[]> = {
  hoa: [
    /\bhoa\b/,
    /homeowners?'? ?association/,
    /property[- ]?owners?'? ?association/,
    /\bcc&?rs?\b/,
    /\bpoa\b/,
    /declaration|covenant|deed restriction|architectural/,
    /violation notice|fine schedule/,
  ],
  family: [
    /\bdivorce\b/,
    /child (custody|support)/,
    /\bcustody\b/,
    /conservatorship/,
    /possession and access/,
    /spousal (support|maintenance)/,
    /\balimony\b/,
    /\b(pre|post)[- ]?nup/,
    /premarital agreement|marital property agreement/,
    /family violence|protective order/,
  ],
  debt: [
    /debt collector|collection agency/,
    /\bfdcpa\b|\bfcra\b/,
    /\bcreditor\b/,
    /\bgarnish/,
    /sued (for|over|about) (a |my )?debt/,
    /\bbankruptcy\b/,
    /chapter (7|13)/,
    /charge[- ]?off/,
    /credit report/,
  ],
  lien: [
    /\blien\b/,
    /foreclos/,
    /notice of sale/,
    /trustee('s)? sale/,
    /mechanic'?s lien|materialman/,
    /judgment lien/,
    /title (commitment|encumbrance|defect)/,
    /deed of trust/,
    /reinstat(e|ement)/,
  ],
  tax: [
    /\birs\b/,
    /back taxes/,
    /innocent spouse/,
    /tax (lien|levy|notice|audit|controversy)/,
    /\blevy\b|levied/,
    /collection due process|\bcdp\b/,
    /penalty abatement/,
    /offer in compromise/,
    /notice of intent to levy/,
  ],
  employment: [
    /\bfired\b|wrongful(ly)? terminat/,
    /\blaid off\b/,
    /discriminat/,
    /\bretaliat/,
    /\bharass/,
    /hostile work/,
    /non[- ]?compete/,
    /\bseverance\b/,
    /\beeoc\b|\btwc\b/,
    /unpaid wages|overtime/,
    /\bfmla\b/,
  ],
  defamation: [
    /defamation|defamatory/,
    /\blibel\b/,
    /\bslander\b/,
    /false (statement|review|accusation|thing)/,
    /\banti[- ]?slapp\b/,
    /posted (false|lies)|ruining my reputation|trashing my reputation/,
  ],
  "personal-injury": [
    /car (accident|wreck|crash)/,
    /personal injury/,
    /\binjured\b|\binjury\b/,
    /slip and fall/,
    /medical malpractice/,
    /wrongful death/,
    /insurance adjuster/,
    /\bnegligence\b/,
  ],
  estate: [
    /last will|will and testament/,
    /\btrust\b/,
    /estate plan/,
    /power of attorney/,
    /\bprobate\b/,
    /transfer[- ]?on[- ]?death|\btod deed\b/,
    /beneficiary designation/,
    /guardian nomination/,
    /\binheritance\b/,
  ],
};

/**
 * Detect which deep-dive practice area(s) a block of text implicates. Returns
 * the highest-scoring areas (up to MAX_AREAS), most relevant first; empty when
 * nothing matches.
 */
export function detectAcpAreas(haystack: string): AcpArea[] {
  const text = haystack.toLowerCase();
  const hits: { area: AcpArea; score: number }[] = [];

  for (const area of Object.keys(AREA_SIGNALS) as AcpArea[]) {
    let score = 0;
    for (const re of AREA_SIGNALS[area]) {
      if (re.test(text)) score++;
    }
    if (score > 0) hits.push({ area, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, MAX_AREAS).map((h) => h.area);
}

type MessageLike = { role: string; content: unknown };
type CaseFileSignals = Pick<
  CaseFile,
  "matter_subtype" | "title" | "summary" | "next_action"
>;

/**
 * Build the detection haystack from the conversation and the durable case-file
 * signals, then detect the implicated area(s). The case file (set on returning
 * sessions) and the full message history both contribute, so once an area has
 * been mentioned it stays detected for the rest of the matter.
 */
export function detectAcpAreasFromContext(
  messages: readonly MessageLike[],
  caseFile: CaseFileSignals | null,
): AcpArea[] {
  const parts: string[] = [];

  if (caseFile) {
    parts.push(
      caseFile.matter_subtype ?? "",
      caseFile.title ?? "",
      caseFile.summary ?? "",
      caseFile.next_action ?? "",
    );
  }

  for (const m of messages) {
    if (typeof m.content === "string") parts.push(m.content);
  }

  return detectAcpAreas(parts.join("\n"));
}
