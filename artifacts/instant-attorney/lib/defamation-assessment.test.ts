import { test } from "node:test";
import assert from "node:assert/strict";
import { assessDefamation, defamationToFact, DEFAMATION_FACT_LABEL } from "./defamation-assessment.ts";
import { isKnownDefamationStatuteKey } from "./defamation-statutes.ts";
import { isKnownDefamationInstrumentKey } from "./defamation-instruments.ts";

const strongPrivate = {
  statementType: "fact" as const,
  isFalse: true,
  publishedToOthers: true,
  aboutYou: true,
  plaintiffStatus: "private" as const,
  perSeCategory: "crime" as const,
  matterOfPublicConcern: false,
  monthsSincePublished: 2,
  speakerKnown: true,
};

test("pure opinion is not actionable => likely_not", () => {
  const a = assessDefamation({ ...strongPrivate, statementType: "opinion" });
  assert.equal(a.strength, "likely_not");
  assert.ok(a.elements.find((e) => e.element.includes("false statement of fact"))!.status === "not_met");
});

test("a strong private-figure fact pattern is potentially viable", () => {
  const a = assessDefamation(strongPrivate);
  assert.equal(a.strength, "potentially_viable");
  assert.ok(a.actions.some((x) => /retraction/i.test(x.step)));
  assert.ok(a.actions.some((x) => /preserve/i.test(x.step) && x.urgent));
});

test("past one year => time-barred => likely_not with a severe warning", () => {
  const a = assessDefamation({ ...strongPrivate, monthsSincePublished: 14 });
  assert.equal(a.strength, "likely_not");
  assert.ok(a.warnings.some((w) => w.severe && /deadline/i.test(w.text)));
});

test("public figure makes it uphill and adds the actual-malice statute", () => {
  const a = assessDefamation({ ...strongPrivate, plaintiffStatus: "public_figure" });
  assert.equal(a.strength, "uphill");
  assert.ok(a.relevant_statutes.includes("actual-malice-public-figure"));
});

test("matter of public concern raises a SEVERE anti-SLAPP fee warning", () => {
  const a = assessDefamation({ ...strongPrivate, matterOfPublicConcern: true });
  assert.equal(a.strength, "uphill");
  assert.ok(a.warnings.some((w) => w.severe && /attorney's fees/i.test(w.text)));
  assert.ok(a.relevant_statutes.includes("tx-tcpa-anti-slapp"));
});

test("anonymous poster adds the § 230 note and an identify-the-poster action", () => {
  const a = assessDefamation({ ...strongPrivate, speakerKnown: false });
  assert.ok(a.relevant_statutes.includes("us-section-230"));
  assert.ok(a.warnings.some((w) => /anonymous|§ 230/i.test(w.text)));
  assert.ok(a.actions.some((x) => /identify/i.test(x.step)));
});

test("missing inputs => needs_more_info, not a false verdict", () => {
  const a = assessDefamation({ publishedToOthers: true, aboutYou: true });
  assert.equal(a.strength, "needs_more_info");
});

test("approaching the deadline adds an urgent action", () => {
  const a = assessDefamation({ ...strongPrivate, monthsSincePublished: 10 });
  assert.ok(a.actions.some((x) => x.urgent && /deadline/i.test(x.step)));
});

test("references resolve; the deadline warning is always present", () => {
  const a = assessDefamation(strongPrivate);
  for (const k of a.relevant_statutes) assert.ok(isKnownDefamationStatuteKey(k), `bad statute ${k}`);
  for (const k of a.relevant_instruments) assert.ok(isKnownDefamationInstrumentKey(k), `bad instrument ${k}`);
  assert.ok(a.warnings.some((w) => /one year/i.test(w.text)));
});

test("fact reflects the verdict", () => {
  const fact = defamationToFact(assessDefamation(strongPrivate));
  assert.equal(fact.label, DEFAMATION_FACT_LABEL);
  assert.match(fact.value, /core elements/i);
  assert.match(defamationToFact(assessDefamation({ ...strongPrivate, statementType: "opinion" })).value, /unlikely/i);
});
