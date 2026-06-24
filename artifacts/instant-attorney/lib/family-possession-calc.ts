// ── Texas Standard Possession Order (SPO) schedule generator ──────────────────
//
// The single most concrete thing a frightened parent wants: "when, exactly, do I
// have my kids?" Texas presumes the Standard Possession Order for a child 3 or
// older (§§ 153.252, 153.3101–153.317). This module turns that statutory schedule
// into an actual calendar of weekend and Thursday possession periods, plus the
// standard holiday-allocation and summer rules.
//
// Pure and deterministic — all date math is done in UTC so there is no timezone
// drift, and there is no I/O. Times of day (the SPO's 6:00 p.m. pickups, school
// dismissal/resumption for the "expanded" election) are described in notes rather
// than encoded, because the calendar of DATES is the genuinely useful, unambiguous
// output. This is general legal information and an estimate of the standard
// schedule — a court can order a different schedule, and the order itself governs.

export type Distance = "within_100" | "over_100";

export interface PossessionInput {
  /** Inclusive range start, ISO yyyy-mm-dd. */
  startDate: string;
  /** Inclusive range end, ISO yyyy-mm-dd. */
  endDate: string;
  /** Whether the parents reside within 100 miles of each other. */
  distance: Distance;
  /** Expanded SPO election (pickup at school Friday → return Monday; Thursday →
   *  Friday), which lengthens the standard periods. */
  expanded?: boolean;
}

export interface PossessionPeriod {
  kind: "weekend" | "thursday";
  /** ISO start date of the period. */
  start: string;
  /** ISO end date of the period. */
  end: string;
  /** e.g. "1st weekend", "3rd weekend", "Thursday". */
  label: string;
}

export interface PossessionSchedule {
  periods: PossessionPeriod[];
  distance: Distance;
  expanded: boolean;
  summerNote: string;
  /** Standard SPO holiday-allocation rules from the possessory parent's view. */
  holidayRules: string[];
  assumptions: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is a calendar of the Texas Standard Possession Order schedule for general information — not legal advice. Pickup/return times (generally 6:00 p.m., or school dismissal/resumption under the expanded election), holidays, and summer can change the day-to-day schedule, and a court can order something different. Your actual court order controls.";

const MS_PER_DAY = 86_400_000;

/** Parse a yyyy-mm-dd string into a UTC date, or null if malformed. */
function parseISO(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject impossible dates (e.g. Feb 31 rolled over).
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/** Nth occurrence of this weekday within its month (1st, 2nd, ... Friday). */
function ordinalInMonth(d: Date): number {
  return Math.ceil(d.getUTCDate() / 7);
}

const ORDINAL_LABEL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th" };

const yearParity = (y: number) => (y % 2 === 0 ? "even" : "odd");

/**
 * Generate the regular SPO weekend + Thursday possession periods within a date
 * range, plus the standard holiday/summer rules. Deterministic.
 */
export function generatePossessionSchedule(input: PossessionInput): PossessionSchedule {
  const start = parseISO(input.startDate);
  const end = parseISO(input.endDate);
  if (!start || !end) {
    throw new RangeError("startDate and endDate must be yyyy-mm-dd dates");
  }
  if (end.getTime() < start.getTime()) {
    throw new RangeError("endDate must be on or after startDate");
  }
  // Bound the scan so a pathological range can't loop unbounded (~3 years).
  const maxDays = 1100;
  const spanDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
  if (spanDays > maxDays) {
    throw new RangeError("Date range is too large; request 3 years or less");
  }

  const distance: Distance = input.distance === "over_100" ? "over_100" : "within_100";
  const expanded = Boolean(input.expanded);
  const periods: PossessionPeriod[] = [];

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    const dow = cursor.getUTCDay(); // 0=Sun … 5=Fri … 4=Thu

    // Weekends: the possessory parent has the 1st, 3rd, and 5th weekends, counted
    // by the month in which the Friday falls.
    if (dow === 5) {
      const ord = ordinalInMonth(cursor);
      if (ord === 1 || ord === 3 || ord === 5) {
        // Standard: Fri → Sun (return Sunday). Expanded: Fri → Mon (return Monday).
        const periodEnd = addDays(cursor, expanded ? 3 : 2);
        periods.push({
          kind: "weekend",
          start: toISO(cursor),
          end: toISO(periodEnd),
          label: `${ORDINAL_LABEL[ord]} weekend`,
        });
      }
    }

    // Thursday during the school term — only when the parents live within 100 miles.
    if (dow === 4 && distance === "within_100") {
      // Standard: Thursday evening (same day). Expanded: Thursday → Friday.
      const periodEnd = expanded ? addDays(cursor, 1) : cursor;
      periods.push({
        kind: "thursday",
        start: toISO(cursor),
        end: toISO(periodEnd),
        label: "Thursday",
      });
    }
  }

  const assumptions: string[] = [];
  if (distance === "within_100") {
    assumptions.push(
      "Thursday periods are shown for every Thursday in the range; under the SPO they apply during the school term only."
    );
  } else {
    assumptions.push(
      "Over 100 miles apart: no Thursday periods. The possessory parent may instead elect one weekend per month (with notice) in place of the 1st/3rd/5th-weekend schedule shown."
    );
  }
  if (expanded) {
    assumptions.push(
      "Expanded election applied: weekends run to Monday and Thursdays to Friday (pickup/return at school)."
    );
  }

  const summerNote =
    distance === "within_100"
      ? "Summer: 30 days of extended possession (commonly a continuous block in July), or up to 42 days if the possessory parent designates specific dates in writing by April 1."
      : "Summer: 42 days of extended possession, designated in writing by April 1 (otherwise a default summer period applies).";

  const refYear = start.getUTCFullYear();
  const springBreakRule =
    distance === "within_100"
      ? `Spring break: with the possessory parent in even-numbered years (e.g. ${refYear % 2 === 0 ? refYear : refYear + 1}).`
      : "Spring break: with the possessory parent every year (over 100 miles).";

  const holidayRules = [
    `Christmas: possessory parent has the first half (school dismissal to noon Dec 28) in even-numbered years and the second half (noon Dec 28 to school resumption) in odd-numbered years. ${refYear} is an ${yearParity(refYear)} year.`,
    "Thanksgiving: with the possessory parent in odd-numbered years.",
    springBreakRule,
    "Child's birthday: with the parent who does not otherwise have the child that day, for a set period.",
    "Mother's Day weekend is with the mother; Father's Day weekend is with the father, regardless of the regular schedule.",
  ];

  return {
    periods,
    distance,
    expanded,
    summerNote,
    holidayRules,
    assumptions,
    disclaimer: DISCLAIMER,
  };
}

/** A {label, value} pair for the Living File's dedupe-by-prefix fact writer. */
export interface EstimateFact {
  label: string;
  value: string;
}

/** Stable label so re-running UPDATES the same fact in place. */
export const POSSESSION_FACT_LABEL = "Possession schedule (Texas Standard Possession Order)";

/** Turn a generated schedule into a confirmed fact so a parenting plan / decree
 * seeds from the chosen SPO variant. */
export function possessionScheduleToFact(est: PossessionSchedule): EstimateFact {
  const weekendCount = est.periods.filter((p) => p.kind === "weekend").length;
  const miles = est.distance === "within_100" ? "within 100 miles" : "over 100 miles apart";
  const variant = est.expanded ? "expanded" : "standard";
  const value = `${variant} Standard Possession Order, parents ${miles}: 1st/3rd/5th weekends${
    est.distance === "within_100" ? " plus Thursday school-term periods" : " (no Thursdays)"
  }; ${weekendCount} weekend period(s) in the requested range. ${est.summerNote} Estimate of the standard schedule, not legal advice; the court order controls.`;
  return { label: POSSESSION_FACT_LABEL, value };
}

/** One-line human summary for chat/document surfaces. */
export function formatPossessionSchedule(est: PossessionSchedule): string {
  const weekendCount = est.periods.filter((p) => p.kind === "weekend").length;
  const thursdayCount = est.periods.filter((p) => p.kind === "thursday").length;
  return `${est.expanded ? "Expanded" : "Standard"} Possession Order (${
    est.distance === "within_100" ? "within 100 miles" : "over 100 miles"
  }): ${weekendCount} weekend period(s)${thursdayCount ? ` and ${thursdayCount} Thursday period(s)` : ""} in the requested range.`;
}
