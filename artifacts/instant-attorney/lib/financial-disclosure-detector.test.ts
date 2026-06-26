import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFinancialDisclosure, freeChatFinanceNotice } from "./financial-disclosure-detector.ts";

test("catches identifiers that never belong in unprivileged chat", () => {
  assert.ok(detectFinancialDisclosure("my ssn is 123-45-6789").triggered);
  assert.ok(detectFinancialDisclosure("social security number coming up").triggered);
  assert.ok(detectFinancialDisclosure("my account number is 00123456789").triggered);
  assert.ok(detectFinancialDisclosure("routing number 021000021").triggered);
});

test("catches asset talk paired with dollar values", () => {
  const s = detectFinancialDisclosure("my 401k has about $85,000 and savings around $12k");
  assert.ok(s.triggered);
  assert.ok(s.reasons.some((r) => /balance|value/i.test(r)));
});

test("catches an explicit account rundown", () => {
  assert.ok(detectFinancialDisclosure("ok here's my financial picture, my accounts are...").triggered);
  assert.ok(detectFinancialDisclosure("let me give you my account balance").triggered);
});

test("tolerates ordinary money mentions (no false positive)", () => {
  assert.ok(!detectFinancialDisclosure("a debt collector says I owe $500").triggered);
  assert.ok(!detectFinancialDisclosure("my landlord kept my $1,200 deposit").triggered);
  assert.ok(!detectFinancialDisclosure("I think I was wrongfully terminated").triggered);
  assert.ok(!detectFinancialDisclosure("").triggered);
});

test("notice is non-empty and mentions privilege + Phase II", () => {
  const n = freeChatFinanceNotice();
  assert.match(n, /privile/i);
  assert.match(n, /Phase II/);
});
