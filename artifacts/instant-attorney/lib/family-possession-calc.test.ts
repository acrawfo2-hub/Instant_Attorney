import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePossessionSchedule,
  possessionScheduleToFact,
  formatPossessionSchedule,
  POSSESSION_FACT_LABEL,
} from "./family-possession-calc.ts";

// January 2025: Fridays fall on Jan 3 (1st), 10 (2nd), 17 (3rd), 24 (4th), 31 (5th).
// The possessory parent gets the 1st, 3rd, and 5th: Jan 3, 17, 31.
const JAN = { startDate: "2025-01-01", endDate: "2025-01-31" };

test("generates the 1st/3rd/5th weekends, counted by the Friday's month", () => {
  const sched = generatePossessionSchedule({ ...JAN, distance: "within_100" });
  const weekendStarts = sched.periods.filter((p) => p.kind === "weekend").map((p) => p.start);
  assert.deepEqual(weekendStarts, ["2025-01-03", "2025-01-17", "2025-01-31"]);
  const labels = sched.periods.filter((p) => p.kind === "weekend").map((p) => p.label);
  assert.deepEqual(labels, ["1st weekend", "3rd weekend", "5th weekend"]);
});

test("standard weekend runs Friday → Sunday; expanded runs Friday → Monday", () => {
  const std = generatePossessionSchedule({ ...JAN, distance: "within_100" });
  const firstStd = std.periods.find((p) => p.kind === "weekend")!;
  assert.equal(firstStd.start, "2025-01-03");
  assert.equal(firstStd.end, "2025-01-05"); // Sunday

  const exp = generatePossessionSchedule({ ...JAN, distance: "within_100", expanded: true });
  const firstExp = exp.periods.find((p) => p.kind === "weekend")!;
  assert.equal(firstExp.end, "2025-01-06"); // Monday
  assert.equal(exp.expanded, true);
});

test("within 100 miles includes Thursday periods; over 100 miles does not", () => {
  const near = generatePossessionSchedule({ ...JAN, distance: "within_100" });
  const nearThu = near.periods.filter((p) => p.kind === "thursday");
  // Thursdays in Jan 2025: 2, 9, 16, 23, 30 → 5.
  assert.equal(nearThu.length, 5);
  assert.equal(nearThu[0].start, "2025-01-02");

  const far = generatePossessionSchedule({ ...JAN, distance: "over_100" });
  assert.equal(far.periods.filter((p) => p.kind === "thursday").length, 0);
  // Weekends are unaffected by distance.
  assert.equal(far.periods.filter((p) => p.kind === "weekend").length, 3);
});

test("expanded Thursday runs Thursday → Friday", () => {
  const exp = generatePossessionSchedule({ ...JAN, distance: "within_100", expanded: true });
  const thu = exp.periods.find((p) => p.kind === "thursday")!;
  assert.equal(thu.start, "2025-01-02");
  assert.equal(thu.end, "2025-01-03");
});

test("summer and spring-break rules differ by distance", () => {
  const near = generatePossessionSchedule({ ...JAN, distance: "within_100" });
  const far = generatePossessionSchedule({ ...JAN, distance: "over_100" });
  assert.match(near.summerNote, /30 days/);
  assert.match(far.summerNote, /42 days/);
  assert.ok(near.holidayRules.some((r) => /spring break/i.test(r) && /even-numbered/i.test(r)));
  assert.ok(far.holidayRules.some((r) => /spring break/i.test(r) && /every year/i.test(r)));
});

test("holiday rules are present and name Christmas and Thanksgiving", () => {
  const sched = generatePossessionSchedule({ ...JAN, distance: "within_100" });
  assert.ok(sched.holidayRules.some((r) => /christmas/i.test(r)));
  assert.ok(sched.holidayRules.some((r) => /thanksgiving/i.test(r)));
});

test("invalid input throws", () => {
  assert.throws(() => generatePossessionSchedule({ startDate: "nope", endDate: "2025-01-31", distance: "within_100" }), RangeError);
  assert.throws(() => generatePossessionSchedule({ startDate: "2025-02-01", endDate: "2025-01-01", distance: "within_100" }), RangeError);
  assert.throws(() => generatePossessionSchedule({ startDate: "2020-01-01", endDate: "2025-01-01", distance: "within_100" }), RangeError);
});

test("estimate-to-fact uses the stable label and notes distance + variant", () => {
  const sched = generatePossessionSchedule({ ...JAN, distance: "over_100", expanded: true });
  const fact = possessionScheduleToFact(sched);
  assert.equal(fact.label, POSSESSION_FACT_LABEL);
  assert.match(fact.value, /expanded/i);
  assert.match(fact.value, /over 100 miles/i);
  assert.match(fact.value, /no Thursdays/i);
});

test("formatter summarizes the period counts", () => {
  const line = formatPossessionSchedule(generatePossessionSchedule({ ...JAN, distance: "within_100" }));
  assert.match(line, /3 weekend/);
  assert.match(line, /5 Thursday/);
});
