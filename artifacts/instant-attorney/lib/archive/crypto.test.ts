import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// A 32-byte key must exist before the module reads it.
process.env.ARCHIVE_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { encryptArchive, decryptArchive, archiveEncryptionConfigured } = await import("./crypto.ts");

test("archive encryption round-trips byte-identically", () => {
  const original = Buffer.from("Confidential client file — privileged. 🔐 áéí", "utf8");
  const blob = encryptArchive(original);
  // Ciphertext must differ from plaintext and carry the iv+tag header.
  assert.ok(blob.length > original.length);
  assert.notDeepEqual(blob.subarray(28), original);
  const back = decryptArchive(blob);
  assert.deepEqual(back, original);
});

test("each encryption uses a fresh IV (ciphertexts differ)", () => {
  const data = Buffer.from("same input");
  const a = encryptArchive(data);
  const b = encryptArchive(data);
  assert.notDeepEqual(a, b);
  assert.deepEqual(decryptArchive(a), data);
  assert.deepEqual(decryptArchive(b), data);
});

test("tampered ciphertext fails authentication", () => {
  const blob = encryptArchive(Buffer.from("integrity matters"));
  blob[blob.length - 1] ^= 0xff; // flip a bit in the ciphertext
  assert.throws(() => decryptArchive(blob));
});

test("archiveEncryptionConfigured reflects the env key", () => {
  assert.equal(archiveEncryptionConfigured(), true);
});
