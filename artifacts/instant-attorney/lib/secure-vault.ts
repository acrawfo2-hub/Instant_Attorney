// ── Secure identifier vault — encryption core ────────────────────────────────
//
// Milestone 5 of docs/financial-picture-spec.md. Raw identifiers (SSNs, full
// account/routing/policy numbers) are NEVER stored in financial_items and NEVER
// sent to the model. When one is genuinely needed (at filing time), it is
// encrypted here with AES-256-GCM under an app key and stored apart, in
// financial_secure_ref. Only attorney/drafting server code decrypts it.
//
// Server-only (uses node:crypto). The key comes from FINANCIAL_VAULT_KEY (a
// base64-encoded 32-byte key); if it is absent the vault is DISABLED and the API
// fails closed rather than ever persisting plaintext.

import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const VERSION = "v1";

/** The 32-byte vault key from env, or null if unconfigured/invalid. */
export function getVaultKey(): Buffer | null {
  const b64 = process.env.FINANCIAL_VAULT_KEY;
  if (!b64) return null;
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

export function vaultConfigured(): boolean {
  return getVaultKey() !== null;
}

/** Encrypt plaintext to a self-describing, versioned blob. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a blob produced by encryptSecret. Throws on tampering or wrong key. */
export function decryptSecret(blob: string, key: Buffer): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Unsupported ciphertext format");
  const [, ivB, tagB, ctB] = parts;
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
}

export const KEY_VERSION = VERSION;

/** The last 4 digits of an identifier, for redacted display (never the rest). */
export function last4(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits;
}
