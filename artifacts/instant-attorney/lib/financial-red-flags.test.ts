import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanTextForConcealment,
  scanItemRedFlags,
  highestSeverity,
  flagsNeedAttorney,
  redFlagGuidance,
} from "./financial-red-flags.ts";

test("catches an insider transfer as critical", () => {
  const f = scanTextForConcealment("I transferred the boat to my brother last year");
  assert.ok(f.some((x) => x.code === "insider_transfer" && x.severity === "critical"));
});

test("catches 'holding it for me' phrasing", () => {
  assert.ok(scanTextForConcealment("my cousin is holding it for me right now").some((x) => x.code === "insider_transfer"));
  assert.ok(scanTextForConcealment("the truck is in my mom's name").some((x) => x.code === "insider_transfer"));
});

test("catches concealment language as critical and educates", () => {
  const f = scanTextForConcealment("can we just keep this off the books so they can't find it");
  const flag = f.find((x) => x.code === "concealment_language");
  assert.ok(flag);
  assert.equal(flag.severity, "critical");
  assert.match(flag.message, /can'?t prepare anything that omits|crime|protects you/i);
});

test("catches insider preference payments", () => {
  assert.ok(scanTextForConcealment("I paid back my parents right before filing").some((x) => x.code === "insider_preference"));
});

test("catches a below-market transfer", () => {
  assert.ok(scanTextForConcealment("I sold the car to my friend for $1").some((x) => x.code === "below_market_transfer"));
});

test("flags the OTHER side dissipating assets (protects the client)", () => {
  const f = scanTextForConcealment("my spouse drained the secret account");
  const flag = f.find((x) => x.code === "partner_dissipation");
  assert.ok(flag);
  assert.match(flag.message, /discovery|your favor|traced/i);
});

test("benign descriptions don't trip the detector", () => {
  assert.deepEqual(scanTextForConcealment("Chase checking, opened 2015, my paycheck goes here"), []);
  assert.deepEqual(scanTextForConcealment("2019 Honda Civic bought during the marriage"), []);
  assert.deepEqual(scanTextForConcealment(""), []);
});

test("scanItemRedFlags reads label + acquisition note", () => {
  const flags = scanItemRedFlags({ label: "Lake house", acquisition_note: "deeded to my sister to protect it" });
  assert.ok(flags.some((x) => x.code === "insider_transfer"));
});

test("severity + escalation helpers", () => {
  const flags = scanTextForConcealment("I gave it to my brother and want to hide it");
  assert.equal(highestSeverity(flags), "critical");
  assert.ok(flagsNeedAttorney(flags));
  assert.equal(highestSeverity([]), null);
  assert.ok(!flagsNeedAttorney([]));
  assert.match(redFlagGuidance(), /honest disclosure|protects you/i);
});
