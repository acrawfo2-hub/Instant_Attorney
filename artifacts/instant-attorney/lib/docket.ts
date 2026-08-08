// ── Case-wide deadline docketing engine ──────────────────────────────────────
//
// An expert attorney's core discipline is the docket: every date the client
// mentions (served, notice received, incident, publication, termination)
// immediately becomes a computed deadline with a countdown. This module is the
// deterministic layer that does that math.
//
// HOW DATES REACH THE DOCKET
// The Living File extractor records dated trigger events as confirmed facts in
// a canonical format:   Key date · <event> · <YYYY-MM-DD> — <description>
// (same prefix-tagging pattern as the What-If Game's "What-if · " facts — no
// DB migration required, and the fact remains a readable sentence on the file).
// `computeDocket` parses those facts plus any fact that already carries an
// explicit ISO deadline ("file by 2026-09-01"), applies the deterministic rules
// below (seeded from the per-practice-area statute catalogs), and returns
// deadline entries with days remaining and urgency.
//
// PURE MODULE — no server imports, no Supabase, no AI SDK. Safe to use from
// "use client" components (chat welcome), server components (ClientFileView),
// and prompt assembly (buildFileContext).
//
// General legal information, not legal advice. Every computed deadline carries
// a caveat: tolling, discovery rules, and exceptions can change real deadlines,
// and per the engagement scope (lib/agreement-sign.ts) calendaring remains the
// client's responsibility — verify with the attorney.

export type DocketUrgency = "expired" | "critical" | "warning" | "normal";

export interface DocketEntry {
  /** Stable id: `<event>:<triggerDate>` (or `explicit:<factId>`). */
  id: string;
  /** Trigger event key, e.g. "served_lawsuit". */
  event: string;
  /** Human label for the deadline, e.g. "Answer to the lawsuit due". */
  label: string;
  /** ISO date the clock started. */
  triggerDate: string;
  /** ISO computed deadline date. */
  deadlineDate: string;
  /** Whole days from `now` to the deadline (negative = passed). */
  daysRemaining: number;
  urgency: DocketUrgency;
  /** Statutory basis, e.g. "Tex. Civ. Prac. & Rem. Code § 16.003". */
  basis: string;
  /** Why this deadline matters, plain language. */
  explain: string;
  /** The source fact's description (for provenance display). */
  sourceFact: string;
  /** Id of the source fact row, when known. */
  sourceFactId: string | null;
}

/** The universal caveat every computed deadline carries. */
export const DOCKET_CAVEAT =
  "Computed from the dates on your file — verify with your attorney. Tolling, the discovery rule, and other exceptions can move a real deadline, and deadline calendaring remains your responsibility under the engagement agreement.";

// ── Trigger events & deterministic rules ─────────────────────────────────────
//
// Each rule: trigger event → one or more computed deadlines. Periods are the
// Texas/federal defaults from the statute catalogs already in this codebase
// (pi-sol-calc, defamation-assessment, employment-claim-assessment,
// debt-statutes). Keep this list conservative: only rules whose trigger is a
// single concrete date and whose period is a bright-line default.

interface DeadlineRule {
  label: string;
  basis: string;
  explain: string;
  /** Which law the period comes from. Texas rules are suppressed for confirmed
   * non-Texas matters (Local Counsel Prep); federal rules apply everywhere. */
  scope: "texas" | "federal";
  /** Compute the deadline date from the trigger date. */
  compute: (trigger: Date) => Date;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
function addYears(d: Date, years: number): Date {
  const out = new Date(d.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}
/** Texas answer date: 10 a.m. the Monday next after the expiration of 20 days
 * from service (Tex. R. Civ. P. 99). We return that Monday as a date. */
function texasAnswerDate(served: Date): Date {
  const twentieth = addDays(served, 20);
  const day = twentieth.getUTCDay(); // 0 Sun … 6 Sat
  // "Monday next after" the 20th day: the first Monday STRICTLY after it.
  const daysToMonday = ((8 - day) % 7) || 7;
  return addDays(twentieth, daysToMonday);
}

/** Canonical trigger-event keys the extractor may emit. */
export const DOCKET_EVENTS = [
  "served_lawsuit",
  "incident_injury",
  "publication",
  "termination",
  "debt_last_due",
  "collector_notice",
  "contract_breach",
  "explicit_deadline",
] as const;
export type DocketEvent = (typeof DOCKET_EVENTS)[number];

const RULES: Record<Exclude<DocketEvent, "explicit_deadline">, DeadlineRule[]> = {
  served_lawsuit: [
    {
      label: "Answer to the lawsuit due",
      basis: "Tex. R. Civ. P. 99 (Monday next after 20 days from service)",
      explain:
        "If no answer is filed by this date, the other side can take a default judgment — this is usually the most urgent date on a file.",
      scope: "texas",
      compute: texasAnswerDate,
    },
  ],
  incident_injury: [
    {
      label: "Personal-injury filing deadline (2-year statute of limitations)",
      basis: "Tex. Civ. Prac. & Rem. Code § 16.003",
      explain: "A personal-injury suit generally must be filed within two years of the injury.",
      scope: "texas",
      compute: (t) => addYears(t, 2),
    },
  ],
  publication: [
    {
      label: "Defamation filing deadline (1-year statute of limitations)",
      basis: "Tex. Civ. Prac. & Rem. Code § 16.002",
      explain: "A defamation suit must be filed within one year of publication — much shorter than most deadlines.",
      scope: "texas",
      compute: (t) => addYears(t, 1),
    },
  ],
  termination: [
    {
      label: "EEOC discrimination charge deadline (300 days)",
      basis: "42 U.S.C. § 2000e-5(e)(1) (Texas is a deferral state)",
      explain: "A federal discrimination charge generally must be filed with the EEOC within 300 days of the adverse action.",
      // The 300-day figure assumes a deferral state (Texas). Elsewhere the
      // window can be as short as 180 days — so it is Texas-scoped here.
      scope: "texas",
      compute: (t) => addDays(t, 300),
    },
    {
      label: "Texas Workforce Commission charge deadline (180 days)",
      basis: "Tex. Lab. Code § 21.202",
      explain: "A state discrimination complaint must be filed with the TWC within 180 days of the adverse action.",
      scope: "texas",
      compute: (t) => addDays(t, 180),
    },
  ],
  debt_last_due: [
    {
      label: "Debt becomes time-barred (4-year limitations period)",
      basis: "Tex. Civ. Prac. & Rem. Code § 16.004",
      explain:
        "After four years from the last due date, a collector generally cannot win a lawsuit on the debt. Careful: a payment or written promise can restart this clock.",
      scope: "texas",
      compute: (t) => addYears(t, 4),
    },
  ],
  collector_notice: [
    {
      label: "Deadline to dispute the debt in writing (30 days)",
      basis: "15 U.S.C. § 1692g (FDCPA validation)",
      explain:
        "Disputing in writing within 30 days of the collector's first written notice forces them to pause and verify the debt before collecting.",
      scope: "federal",
      compute: (t) => addDays(t, 30),
    },
  ],
  contract_breach: [
    {
      label: "Contract-claim filing deadline (4-year statute of limitations)",
      basis: "Tex. Civ. Prac. & Rem. Code § 16.004",
      explain: "A suit on a written contract generally must be filed within four years of the breach.",
      scope: "texas",
      compute: (t) => addYears(t, 4),
    },
  ],
};

// ── Fact parsing ─────────────────────────────────────────────────────────────

/** Canonical key-date fact:  Key date · <event> · <YYYY-MM-DD> — <description> */
const KEY_DATE_RE = /^Key date\s*·\s*([a-z_]+)\s*·\s*(\d{4}-\d{2}-\d{2})\s*(?:—|-)?\s*(.*)$/i;

/** Facts that already carry an explicit computed/known deadline date. Mirrors
 * matter-tasks' DEADLINE_RE so both layers agree on what counts. */
const EXPLICIT_DEADLINE_RE =
  /(?:deadline|file by|respond by|due by|statute of limitations|limitations period)[^.\n]*?(\d{4}-\d{2}-\d{2})/i;

function parseIsoUtc(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Strict round-trip: reject JS-normalized impossible dates (2026-02-30 → Mar 2).
  return d.toISOString().slice(0, 10) === iso ? d : null;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date where the client and the courts are (America/Chicago),
 * as a UTC-midnight Date — so "days left" is a calendar-day difference, not a
 * UTC-midnight artifact that flips a deadline to "tomorrow" late in the evening. */
function calendarToday(now: Date): Date {
  const iso = now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // YYYY-MM-DD
  return new Date(`${iso}T00:00:00Z`);
}

function daysUntil(deadline: Date, now: Date): number {
  return Math.round((deadline.getTime() - calendarToday(now).getTime()) / 86_400_000);
}

export function urgencyFromDays(days: number): DocketUrgency {
  if (days < 0) return "expired";
  if (days <= 60) return "critical";
  if (days <= 180) return "warning";
  return "normal";
}

export interface DocketFactInput {
  id?: string;
  description: string;
  status?: string;
  kind?: string;
}

/** Do Texas-scoped rules apply? Yes for Texas, unset, or unconfirmed
 * jurisdiction (the app's stated default is Texas); no once a different state
 * is confirmed — those files are in Local Counsel Prep and only see
 * jurisdiction-neutral recorded deadlines plus federal rules. */
export function texasRulesApply(jurisdiction: string | null | undefined): boolean {
  const j = jurisdiction?.trim();
  if (!j) return true;
  if (/unconfirmed/i.test(j)) return true;
  return /^(texas|tx)\b/i.test(j);
}

/**
 * Compute the docket from the file's facts. Deterministic; safe on client and
 * server. Entries are deduped by id and sorted most-pressing first.
 * `jurisdiction` is the case file's jurisdiction text; confirmed non-Texas
 * matters get only explicit recorded deadlines and federal-law rules.
 */
export function computeDocket(
  facts: DocketFactInput[],
  now: Date = new Date(),
  jurisdiction?: string | null
): DocketEntry[] {
  const entries = new Map<string, DocketEntry>();
  const allowTexas = texasRulesApply(jurisdiction);

  for (const f of facts) {
    if (f.status === "gap") continue;
    if (f.kind === "hypothetical" || /^What-if · /i.test(f.description)) continue;

    const keyed = f.description.match(KEY_DATE_RE);
    if (keyed) {
      const [, rawEvent, iso, rest] = keyed;
      const event = rawEvent.toLowerCase() as DocketEvent;
      const trigger = parseIsoUtc(iso);
      if (!trigger) continue;

      if (event === "explicit_deadline") {
        const days = daysUntil(trigger, now);
        const id = `explicit:${iso}`;
        if (!entries.has(id)) {
          entries.set(id, {
            id,
            event,
            label: rest.trim() || "Deadline on file",
            triggerDate: iso,
            deadlineDate: iso,
            daysRemaining: days,
            urgency: urgencyFromDays(days),
            basis: "Recorded on your file",
            explain: "A concrete deadline recorded from your conversation or documents.",
            sourceFact: f.description,
            sourceFactId: f.id ?? null,
          });
        }
        continue;
      }

      const rules = (RULES as Record<string, DeadlineRule[]>)[event];
      if (!rules) continue;
      for (const rule of rules) {
        if (rule.scope === "texas" && !allowTexas) continue;
        const deadline = rule.compute(trigger);
        const days = daysUntil(deadline, now);
        const id = `${event}:${iso}:${rule.basis}`;
        if (entries.has(id)) continue;
        entries.set(id, {
          id,
          event,
          label: rule.label,
          triggerDate: iso,
          deadlineDate: toIso(deadline),
          daysRemaining: days,
          urgency: urgencyFromDays(days),
          basis: rule.basis,
          explain: rule.explain,
          sourceFact: f.description,
          sourceFactId: f.id ?? null,
        });
      }
      continue;
    }

    // Fallback: a fact that already states an explicit ISO deadline.
    const explicit = f.description.match(EXPLICIT_DEADLINE_RE);
    if (explicit) {
      const iso = explicit[1];
      const deadline = parseIsoUtc(iso);
      if (!deadline) continue;
      const days = daysUntil(deadline, now);
      const id = `explicit:${iso}`;
      if (entries.has(id)) continue;
      entries.set(id, {
        id,
        event: "explicit_deadline",
        label: "Deadline on file",
        triggerDate: iso,
        deadlineDate: iso,
        daysRemaining: days,
        urgency: urgencyFromDays(days),
        basis: "Recorded on your file",
        explain: "A concrete deadline recorded from your conversation or documents.",
        sourceFact: f.description,
        sourceFactId: f.id ?? null,
      });
    }
  }

  const rank: Record<DocketUrgency, number> = { expired: 0, critical: 1, warning: 2, normal: 3 };
  return [...entries.values()].sort(
    (a, b) => rank[a.urgency] - rank[b.urgency] || a.daysRemaining - b.daysRemaining
  );
}

/** The single most pressing entry, or null. */
export function mostPressingDeadline(entries: DocketEntry[]): DocketEntry | null {
  return entries.length ? entries[0] : null;
}

/** Compact docket block for prompt injection (buildFileContext). */
export function formatDocketForPrompt(entries: DocketEntry[]): string[] {
  if (!entries.length) return [];
  const lines = [
    "",
    "KEY DEADLINES (computed from dated facts — deterministic, not model-generated):",
    "(When the client asks about deadlines or timing, answer from THESE computed dates. Always add that tolling and exceptions may apply and the attorney should verify. If a deadline is expired or critical, raise it proactively.)",
  ];
  for (const e of entries) {
    const status =
      e.daysRemaining < 0
        ? `PASSED ${-e.daysRemaining} day(s) ago`
        : `${e.daysRemaining} day(s) left`;
    lines.push(`• [${e.urgency.toUpperCase()}] ${e.label}: ${e.deadlineDate} (${status}) — from ${e.event} on ${e.triggerDate}. Basis: ${e.basis}`);
  }
  return lines;
}

/** One-line human phrasing for the chat welcome, or null when nothing pressing. */
export function describePressingDeadline(entries: DocketEntry[]): string | null {
  const top = mostPressingDeadline(entries);
  if (!top || top.urgency === "normal") return null;
  if (top.daysRemaining < 0) {
    return `⚠️ A key deadline appears to have passed: ${top.label.toLowerCase()} was ${top.deadlineDate}. Some options may still exist — let's talk about it right away.`;
  }
  return `⏰ Heads up: ${top.label.toLowerCase()} is ${top.deadlineDate} — ${top.daysRemaining} day${top.daysRemaining === 1 ? "" : "s"} from now.`;
}
