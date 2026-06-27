import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAcpAreas, detectAcpAreasFromContext } from "./acp-area-router.ts";

test("detects each area from its canonical opener phrasing", () => {
  const cases: Array<[string, string]> = [
    ["My HOA sent me a violation notice and I'm not sure what to do.", "hoa"],
    ["I'm thinking about filing for divorce and have kids.", "family"],
    ["A debt collector keeps contacting me and I'm not sure what to do.", "debt"],
    ["I got a letter from the IRS and I don't know what to do.", "tax"],
    ["I think I was wrongfully terminated.", "employment"],
    ["Someone posted false things about me online and I want it taken down.", "defamation"],
    ["I was injured in a car accident and an insurance adjuster called me.", "personal-injury"],
    ["I'd like to set up a will or estate plan.", "estate"],
  ];
  for (const [text, expected] of cases) {
    assert.ok(
      detectAcpAreas(text).includes(expected as never),
      `"${text}" should detect ${expected}, got ${JSON.stringify(detectAcpAreas(text))}`,
    );
  }
});

test("returns empty for a generic opener with no area signal", () => {
  assert.deepEqual(detectAcpAreas("Hi, I need some legal help with a situation."), []);
});

test("bankruptcy routes to the debt module", () => {
  assert.ok(detectAcpAreas("Should I file Chapter 7 bankruptcy?").includes("debt"));
});

test("does not treat 'will' as a verb as an estate signal", () => {
  assert.deepEqual(detectAcpAreas("Will my employer find out if I complain?"), []);
});

test("caps the number of areas loaded", () => {
  const kitchenSink =
    "divorce custody IRS levy debt collector fired discrimination defamation libel car accident injury will and testament trust HOA";
  assert.ok(detectAcpAreas(kitchenSink).length <= 3);
});

test("ranks the strongest-signal area first", () => {
  const text =
    "I was in a car accident, suffered an injury, the insurance adjuster called, and there may be negligence.";
  assert.equal(detectAcpAreas(text)[0], "personal-injury");
});

test("detectAcpAreasFromContext folds in durable case-file signals", () => {
  const areas = detectAcpAreasFromContext(
    [{ role: "user", content: "What are my next steps?" }],
    {
      matter_subtype: "wrongful termination",
      title: "Employment dispute",
      summary: "Client was fired after reporting safety violations.",
      next_action: "File EEOC charge before the deadline.",
    },
  );
  assert.ok(areas.includes("employment"));
});

test("ignores non-string message content", () => {
  const areas = detectAcpAreasFromContext(
    [{ role: "user", content: [{ type: "image" }] as unknown as string }],
    null,
  );
  assert.deepEqual(areas, []);
});
