import { test } from "node:test";
import assert from "node:assert/strict";
import { redactPII, containsPII } from "./pii-redaction.ts";

test("masks an SSN but keeps its shape and last 4", () => {
  const r = redactPII("my ssn is 123-45-6789 ok");
  assert.match(r.text, /•••-••-6789/);
  assert.ok(!r.text.includes("123-45"));
  assert.equal(r.count, 1);
});

test("masks a card number to its last 4", () => {
  const r = redactPII("card 4242 4242 4242 4242");
  assert.match(r.text, /4242$/);
  assert.ok(!r.text.includes("4242 4242 4242"));
  assert.equal(r.count, 1);
});

test("masks a bare account/routing number", () => {
  const r = redactPII("Chase checking 1234567890");
  assert.match(r.text, /Chase checking •+7890/);
  assert.ok(!r.text.includes("123456"));
});

test("leaves ordinary money and short numbers alone", () => {
  assert.equal(redactPII("they kept my $1,200 deposit").count, 0);
  assert.equal(redactPII("a collector says I owe $500").count, 0);
  assert.equal(redactPII("2019 Honda Civic").count, 0);
  assert.equal(redactPII("bought for 1500000").count, 0); // 7 digits, not masked
  assert.equal(redactPII("").count, 0);
});

test("containsPII reflects detection", () => {
  assert.ok(containsPII("ssn 123-45-6789"));
  assert.ok(containsPII("acct 998877665"));
  assert.ok(!containsPII("just a normal note about my car"));
});
