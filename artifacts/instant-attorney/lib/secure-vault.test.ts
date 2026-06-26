import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptSecret, decryptSecret, last4, KEY_VERSION } from "./secure-vault.ts";

const key = crypto.randomBytes(32);

test("round-trips plaintext through encrypt/decrypt", () => {
  const secret = "123-45-6789";
  const blob = encryptSecret(secret, key);
  assert.notEqual(blob, secret);
  assert.ok(blob.startsWith(`${KEY_VERSION}:`));
  assert.equal(decryptSecret(blob, key), secret);
});

test("ciphertext differs each time (random IV)", () => {
  const a = encryptSecret("4242424242424242", key);
  const b = encryptSecret("4242424242424242", key);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a, key), decryptSecret(b, key));
});

test("a wrong key cannot decrypt", () => {
  const blob = encryptSecret("secret account 998877", key);
  assert.throws(() => decryptSecret(blob, crypto.randomBytes(32)));
});

test("tampering with the ciphertext is detected (GCM auth tag)", () => {
  const blob = encryptSecret("000111222", key);
  const parts = blob.split(":");
  // Flip a byte in the ciphertext segment.
  const ct = Buffer.from(parts[3], "base64");
  ct[0] ^= 0xff;
  parts[3] = ct.toString("base64");
  assert.throws(() => decryptSecret(parts.join(":"), key));
});

test("last4 extracts the trailing digits for redacted display", () => {
  assert.equal(last4("1234567890"), "7890");
  assert.equal(last4("acct ending 4321"), "4321");
  assert.equal(last4("12"), "12");
});
