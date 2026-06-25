import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateProbateVsTrust,
  estateProbateDisclaimer,
  type EstateProfile,
} from "./estate-probate-estimate.ts";

const base: EstateProfile = {
  married: false,
  ownsHome: true,
  outOfStateRealEstate: false,
  estateSize: "modest",
  useNonProbateTools: true,
};

test("every path returns valid ranges and a consistent total", () => {
  const { paths } = estimateProbateVsTrust(base);
  assert.equal(paths.length, 3);
  for (const p of paths) {
    assert.ok(p.upfront.low <= p.upfront.high, `${p.key} upfront range`);
    assert.ok(p.atDeath.low <= p.atDeath.high, `${p.key} atDeath range`);
    assert.equal(p.total.low, p.upfront.low + p.atDeath.low, `${p.key} total low`);
    assert.equal(p.total.high, p.upfront.high + p.atDeath.high, `${p.key} total high`);
    assert.ok(p.notes.length > 0, `${p.key} notes`);
  }
});

test("will-only never avoids probate; trust always does", () => {
  const { paths } = estimateProbateVsTrust(base);
  const willOnly = paths.find((p) => p.key === "will_only")!;
  const trust = paths.find((p) => p.key === "trust_based")!;
  assert.equal(willOnly.avoidsProbate, false);
  assert.equal(trust.avoidsProbate, true);
  assert.equal(trust.privacy, true);
  assert.equal(trust.incapacityCoverage, true);
  assert.equal(trust.probateProceedings, 0);
});

test("a simple single modest estate: the tools path is cheapest and the verdict says so", () => {
  const r = estimateProbateVsTrust(base);
  assert.equal(r.cheapestTotalKey, "will_plus_tools");
  assert.match(r.verdict, /for less|transfer-on-death/i);
  // Tools avoid probate here (no out-of-state real estate).
  const tools = r.paths.find((p) => p.key === "will_plus_tools")!;
  assert.equal(tools.avoidsProbate, true);
});

test("marriage drives a second probate on the will-only path", () => {
  const single = estimateProbateVsTrust({ ...base, married: false });
  const couple = estimateProbateVsTrust({ ...base, married: true });
  const sOnly = single.paths.find((p) => p.key === "will_only")!;
  const cOnly = couple.paths.find((p) => p.key === "will_only")!;
  assert.equal(sOnly.probateProceedings, 1);
  assert.equal(cOnly.probateProceedings, 2);
  // Two probates cost more than one.
  assert.ok(cOnly.atDeath.high > sOnly.atDeath.high);
});

test("out-of-state real estate adds ancillary probate to the will paths and tips the verdict to the trust", () => {
  const r = estimateProbateVsTrust({ ...base, outOfStateRealEstate: true });
  const willOnly = r.paths.find((p) => p.key === "will_only")!;
  const tools = r.paths.find((p) => p.key === "will_plus_tools")!;
  const trust = r.paths.find((p) => p.key === "trust_based")!;
  // The will paths now carry an ancillary proceeding; the trust still has none.
  assert.ok(willOnly.probateProceedings >= 2);
  assert.equal(tools.avoidsProbate, false);
  assert.equal(trust.probateProceedings, 0);
  assert.match(r.verdict, /out-of-state|another state|ancillary/i);
});

test("bigger estates cost more to probate", () => {
  const modest = estimateProbateVsTrust({ ...base, estateSize: "modest" });
  const substantial = estimateProbateVsTrust({ ...base, estateSize: "substantial" });
  const m = modest.paths.find((p) => p.key === "will_only")!;
  const s = substantial.paths.find((p) => p.key === "will_only")!;
  assert.ok(s.atDeath.high > m.atDeath.high);
});

test("figures are rounded to the nearest $100 for display", () => {
  const { paths } = estimateProbateVsTrust(base);
  for (const p of paths) {
    for (const v of [p.total.low, p.total.high, p.upfront.low, p.atDeath.high]) {
      assert.equal(v % 100, 0, `${p.key} value ${v} not rounded`);
    }
  }
});

test("disclaimer makes clear these are estimates, not a quote", () => {
  const d = estateProbateDisclaimer();
  assert.match(d, /estimate/i);
  assert.match(d, /not a quote|not legal advice/i);
});
