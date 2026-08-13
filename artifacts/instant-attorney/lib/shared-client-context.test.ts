import test from "node:test";
import assert from "node:assert/strict";
import { formatReusableClientContext, isReusableClientFact } from "./shared-client-context.ts";

const fact = (description: string, status = "confirmed", kind = "fact") => ({ description, status, kind });

test("only confirmed stable client details are reusable", () => {
  assert.equal(isReusableClientFact(fact("Home address is 123 Main Street")), true);
  assert.equal(isReusableClientFact(fact("Date of birth is January 2, 1980")), true);
  assert.equal(isReusableClientFact(fact("Home address is 123 Main Street", "gap")), false);
  assert.equal(isReusableClientFact(fact("Estimated income is about $80,000")), false);
  assert.equal(isReusableClientFact(fact("Custody incident occurred on May 3")), false);
});

test("shared context preserves provenance and requires reconfirmation", () => {
  const text = formatReusableClientContext([{ sourceCaseId: "a", sourceCaseTitle: "Estate plan", description: "Home address is 123 Main Street" }]);
  assert.match(text, /From “Estate plan”/);
  assert.match(text, /ask whether.*still current/i);
  assert.match(text, /Never copy automatically/);
});
