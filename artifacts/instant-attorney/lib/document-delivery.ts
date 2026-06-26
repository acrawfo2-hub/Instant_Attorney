/**
 * Document delivery audit trail + snapshot.
 *
 * Every time a rendered document is downloaded we record what was delivered:
 * the review status and watermark state, who pulled it, a SHA-256 of the exact
 * bytes, and a byte-for-byte copy archived in private storage. This is the
 * evidentiary answer to "what did we actually deliver to the client, in what
 * review state, and when?" required to stand behind the watermark promise in
 * AI Philosophy §4.2 and Terms §7.
 *
 * Writes go through a SERVICE-ROLE client only — document_deliveries has no
 * client write policy, so the trail cannot be forged from a user session.
 *
 * Recording is best-effort: a storage or insert hiccup must never block a
 * client's download. Failures are logged loudly; the hash row is still written
 * even when the byte upload fails, so the trail has no silent gaps.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Document } from "./types";

export const DELIVERY_BUCKET = "document-deliveries";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

interface RecordDeliveryInput {
  /** Must be a service-role client — document_deliveries is service-write only. */
  serviceDb: SupabaseClient;
  document: Pick<Document, "id" | "case_file_id" | "user_id" | "status">;
  /** The exact .docx bytes handed to the downloader. */
  buffer: Buffer;
  /** Whether these bytes carried the pre-review watermark (i.e. not approved). */
  watermarked: boolean;
  /** Who performed the download. */
  downloadedBy: string;
  downloadedByIsAttorney: boolean;
}

/**
 * Archive the delivered bytes (de-duplicated by hash) and append an immutable
 * audit row. Never throws — returns the content hash on success, null on failure.
 */
export async function recordDocumentDelivery(input: RecordDeliveryInput): Promise<string | null> {
  const { serviceDb, document, buffer, watermarked, downloadedBy, downloadedByIsAttorney } = input;

  try {
    const hash = sha256(buffer);
    // One object per distinct rendered version; a re-download of the same bytes
    // reuses the existing object rather than re-uploading.
    const path = `${document.id}/${hash}.docx`;

    const stored = await uploadDeliverySnapshot(serviceDb, path, buffer);

    const { error: insertErr } = await serviceDb.from("document_deliveries").insert({
      document_id: document.id,
      case_file_id: document.case_file_id,
      user_id: document.user_id,
      downloaded_by: downloadedBy,
      downloaded_by_is_attorney: downloadedByIsAttorney,
      document_status: document.status ?? null,
      watermarked,
      content_sha256: hash,
      byte_size: buffer.byteLength,
      storage_bucket: stored ? DELIVERY_BUCKET : null,
      storage_path: stored ? path : null,
    });

    if (insertErr) {
      console.error("[document-delivery] audit insert failed:", insertErr.message);
      return null;
    }
    return hash;
  } catch (err) {
    console.error("[document-delivery] recording failed:", err);
    return null;
  }
}

/**
 * Upload the snapshot, creating the private bucket on first use. Returns true if
 * the bytes are stored (either freshly uploaded or already present from an
 * earlier identical delivery), false if the upload could not be completed.
 */
async function uploadDeliverySnapshot(
  serviceDb: SupabaseClient,
  path: string,
  buffer: Buffer
): Promise<boolean> {
  const contentType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  // upsert:false so an identical re-download doesn't rewrite the archived object.
  const attempt = () =>
    serviceDb.storage.from(DELIVERY_BUCKET).upload(path, buffer, { contentType, upsert: false });

  let { error } = await attempt();

  // Same hash already archived — the byte-for-byte record exists; treat as stored.
  if (error && /exist|duplicate/i.test(error.message)) return true;

  // Bucket not provisioned yet — create it once, then retry. Avoids a createBucket
  // round-trip on every (overwhelmingly common) download.
  if (error && /bucket.*not.*found|not.*found.*bucket|no such bucket/i.test(error.message)) {
    const { error: bucketErr } = await serviceDb.storage.createBucket(DELIVERY_BUCKET, { public: false });
    if (bucketErr && !/exist/i.test(bucketErr.message)) {
      console.error("[document-delivery] bucket create failed:", bucketErr.message);
      return false;
    }
    ({ error } = await attempt());
    if (error && /exist|duplicate/i.test(error.message)) return true;
  }

  if (error) {
    console.error("[document-delivery] snapshot upload failed:", error.message);
    return false;
  }
  return true;
}
