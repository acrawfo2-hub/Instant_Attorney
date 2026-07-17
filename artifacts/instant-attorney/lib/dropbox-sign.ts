/**
 * Dropbox Sign (HelloSign) integration scaffold.
 *
 * When DROPBOX_SIGN_API_KEY is unset, helpers report disabled and callers fall
 * back to in-app quick-sign for esign-allowed documents. When configured, we
 * create signature requests via the REST API and ingest completion webhooks.
 */

import { createHmac, timingSafeEqual } from "crypto";

const API_BASE = "https://api.hellosign.com/v3";

export function isDropboxSignConfigured(): boolean {
  return Boolean(process.env.DROPBOX_SIGN_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.DROPBOX_SIGN_API_KEY?.trim();
  if (!key) throw new Error("DROPBOX_SIGN_API_KEY is not configured");
  return key;
}

function authHeader(): string {
  // Dropbox Sign uses HTTP Basic with API key as username and empty password.
  return `Basic ${Buffer.from(`${apiKey()}:`).toString("base64")}`;
}

export interface CreateSignatureRequestInput {
  title: string;
  subject: string;
  message: string;
  /** Signers in order. */
  signers: Array<{ name: string; email: string; order?: number }>;
  /** Raw file bytes (PDF or DOCX). */
  file: Buffer;
  fileName: string;
  /** Opaque metadata returned on webhook (document id, etc.). */
  metadata?: Record<string, string>;
  testMode?: boolean;
}

export interface CreateSignatureRequestResult {
  signatureRequestId: string;
  raw: unknown;
}

/**
 * Create a signature request with a file upload.
 * Returns null when Dropbox Sign is not configured (caller should use in-app sign).
 */
export async function createSignatureRequest(
  input: CreateSignatureRequestInput
): Promise<CreateSignatureRequestResult | null> {
  if (!isDropboxSignConfigured()) return null;

  const form = new FormData();
  form.append("title", input.title);
  form.append("subject", input.subject);
  form.append("message", input.message);
  form.append("test_mode", input.testMode === false ? "0" : "1");

  input.signers.forEach((s, i) => {
    form.append(`signers[${i}][name]`, s.name);
    form.append(`signers[${i}][email_address]`, s.email);
    if (s.order != null) form.append(`signers[${i}][order]`, String(s.order));
  });

  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      form.append(`metadata[${k}]`, v);
    }
  }

  const blob = new Blob([new Uint8Array(input.file)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  form.append("file[0]", blob, input.fileName);

  const res = await fetch(`${API_BASE}/signature_request/send`, {
    method: "POST",
    headers: { Authorization: authHeader() },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dropbox Sign create failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    signature_request?: { signature_request_id?: string };
  };
  const signatureRequestId = json.signature_request?.signature_request_id;
  if (!signatureRequestId) {
    throw new Error("Dropbox Sign response missing signature_request_id");
  }
  return { signatureRequestId, raw: json };
}

/**
 * Verify a Dropbox Sign webhook event hash.
 * Docs: event_hash = HMAC-SHA256(apiKey, event_time + event_type)
 */
export function verifyDropboxSignEventHash(opts: {
  eventTime: string;
  eventType: string;
  eventHash: string;
}): boolean {
  const key = process.env.DROPBOX_SIGN_API_KEY?.trim();
  if (!key) return false;
  const expected = createHmac("sha256", key)
    .update(opts.eventTime + opts.eventType)
    .digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(opts.eventHash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
