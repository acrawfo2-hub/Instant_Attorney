/**
 * Archive encryption — AES-256-GCM at rest for cold-stored client files.
 *
 * Stored blob layout: [ iv (12 bytes) | authTag (16 bytes) | ciphertext ].
 *
 * The key comes from ARCHIVE_ENCRYPTION_KEY (base64-encoded 32 bytes). For
 * production, source this key from a KMS / secret manager and back it up: if the
 * key is lost, the archives are unrecoverable, which is itself a retention
 * failure. The format and key-version field leave room to move to envelope
 * encryption (per-archive data keys wrapped by a KMS key) without changing the
 * stored layout.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export const ENC_ALGO = "aes-256-gcm";
export const ENC_KEY_VERSION = "v1";

const IV_LEN = 12;
const TAG_LEN = 16;

/** True when archival is configured (encryption key present). */
export function archiveEncryptionConfigured(): boolean {
  return !!process.env.ARCHIVE_ENCRYPTION_KEY;
}

function getKey(): Buffer {
  const raw = process.env.ARCHIVE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ARCHIVE_ENCRYPTION_KEY is not set — archival is disabled.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ARCHIVE_ENCRYPTION_KEY must be base64 for exactly 32 bytes (AES-256).");
  }
  return key;
}

export function encryptArchive(plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ENC_ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptArchive(blob: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ENC_ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
